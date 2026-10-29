import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function assert(ok, message) { if (!ok) throw new Error(message); }
export function readRegistry(root = ROOT) {
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'platform/stores.json'), 'utf8'));
  assert(registry.schemaVersion === 1 && Array.isArray(registry.stores) && registry.stores.length, 'Invalid store registry');
  const ids = new Set(), workers = new Set(), databases = new Set(), buckets = new Set();
  for (const store of registry.stores) {
    assert(/^[a-z][a-z0-9-]*$/.test(store.id) && !ids.has(store.id), 'Invalid or duplicate store id'); ids.add(store.id);
    const configs = [store.storefrontConfig, store.adminConfig].map((relative) => {
      assert(typeof relative === 'string' && /^wrangler[.a-z0-9-]*\.jsonc$/.test(relative), 'Unsafe config path');
      // These checked-in configs are strict JSON despite the jsonc extension; fail closed if that changes.
      return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
    });
    configs.forEach((config, index) => {
      assert(config.vars?.APP_SURFACE === (index ? 'admin' : 'storefront'), `${store.id}: wrong app surface`);
      assert(config.name && !workers.has(config.name), `${store.id}: duplicate worker`); workers.add(config.name);
      const db = config.d1_databases?.find(x => x.binding === 'DB');
      const media = config.r2_buckets?.find(x => x.binding === 'MEDIA');
      assert(db?.database_name === store.database?.name && db?.database_id === store.database?.id, `${store.id}: database mismatch`);
      assert(db?.migrations_dir === './drizzle', `${store.id}: unexpected migration directory`);
      assert(media?.bucket_name === store.mediaBucket, `${store.id}: media mismatch`);
      assert((config.vars?.STORE_KEY || 'manar') === store.id, `${store.id}: wrong store key`);
    });
    assert(!databases.has(store.database.id) && !databases.has(store.database.name), 'Stores must have independent databases');
    databases.add(store.database.id); databases.add(store.database.name);
    assert(store.mediaBucket && !buckets.has(store.mediaBucket), 'Stores must have independent media buckets'); buckets.add(store.mediaBucket);
    assert(typeof store.release?.enabled === 'boolean', `${store.id}: missing release policy`);
    for (const url of [store.storefrontUrl, store.adminUrl]) if (url !== null) assert(new URL(url).protocol === 'https:', 'HTTPS required');
    store.workers = configs.map(config => config.name);
  }
  return registry;
}
export function selectStores(registry, selector) {
  assert(typeof selector === 'string' && selector.length, 'Explicit --store manar|rokon|all is required');
  const ids = selector === 'all' ? registry.stores.map(s => s.id) : selector.split(',');
  assert(ids.length && new Set(ids).size === ids.length, 'Duplicate store selection');
  return ids.map(id => { const store = registry.stores.find(s => s.id === id); assert(store, `Unknown store: ${id}`); return store; });
}
export function makePlan(registry, selector, revision, version, verifiedRevision = null) {
  assert(/^[a-f0-9]{40}$/.test(revision || ''), 'A full immutable --revision commit SHA is required');
  assert(/^\d+\.\d+\.\d+$/.test(version), 'Invalid application VERSION');
  return { platformVersion: registry.platformVersion, revision, version, stores: selectStores(registry, selector).map(store => ({
    id: store.id, name: store.name, database: store.database.name, workers: store.workers,
    ready: store.release.enabled && verifiedRevision === revision,
    blockedReason: !store.release.enabled ? 'release_disabled' : verifiedRevision !== revision ? 'private_preview_not_verified_for_revision' : null,
    steps: ['database-export', 'capture-worker-versions', 'migrations', 'deploy-storefront', 'deploy-admin'],
  })) };
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', shell: false, ...options });
  assert(!result.error && result.status === 0, `Command failed: ${command} ${args.slice(0, 3).join(' ')}`);
  return result.stdout || '';
}
export function executePlan(plan, registry, { root = ROOT, command = run, outputDir } = {}) {
  assert(plan.stores.every(store => store.ready), 'Release blocked: every selected store needs an enabled release and verified private preview of this exact commit');
  assert(root === ROOT || command !== run, 'Unexpected execution root');
  const gitRevision = command('git', ['rev-parse', 'HEAD']).trim();
  assert(gitRevision === plan.revision, 'Checkout does not match release revision');
  assert(!command('git', ['status', '--porcelain', '--untracked-files=normal']).trim(), 'Release requires a clean checkout');
  const binary = path.join(root, 'node_modules/wrangler/bin/wrangler.js');
  assert(fs.existsSync(binary), 'Install pinned dependencies before deployment');
  assert(fs.existsSync(path.join(root, 'dist/server/index.js')), 'Build the verified artifact before deployment');
  const dir = outputDir || path.join(root, 'release-artifacts', new Date().toISOString().replace(/[:.]/g, '-') + '-' + plan.revision.slice(0, 12));
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const journal = { ...plan, startedAt: new Date().toISOString(), status: 'running', results: [] };
  const save = () => fs.writeFileSync(path.join(dir, 'release.json'), JSON.stringify(journal, null, 2) + '\n');
  const wrangler = args => command(process.execPath, [binary, ...args]);
  save();
  try {
    // Back up every target before the first migration or deployment in this release.
    for (const selected of plan.stores) {
      const store = registry.stores.find(s => s.id === selected.id);
      const result = { store: store.id, status: 'preflight', steps: [] }; journal.results.push(result); save();
      const backup = path.join(dir, `${store.id}-database.sql`);
      wrangler(['d1', 'export', store.database.name, '--remote', '--config', store.storefrontConfig, '--output', backup]);
      assert(fs.existsSync(backup) && fs.statSync(backup).size > 0, `${store.id}: database backup is missing or empty`);
      result.steps.push('database-export'); save();
      for (const config of [store.storefrontConfig, store.adminConfig]) {
        const versions = wrangler(['versions', 'list', '--config', config, '--json']);
        assert(Array.isArray(JSON.parse(versions)), 'Unexpected worker version response');
        fs.writeFileSync(path.join(dir, `${store.id}-${config}-versions.json`), versions);
        const deployments = wrangler(['deployments', 'list', '--config', config, '--json']);
        JSON.parse(deployments);
        fs.writeFileSync(path.join(dir, `${store.id}-${config}-deployments.json`), deployments);
      }
      result.steps.push('capture-worker-versions'); result.status = 'backed-up'; save();
    }
    for (const result of journal.results) {
      const store = registry.stores.find(s => s.id === result.store);
      result.status = 'deploying'; save();
      wrangler(['d1', 'migrations', 'apply', store.database.name, '--remote', '--config', store.storefrontConfig]);
      result.steps.push('migrations'); save();
      for (const [index, config] of [store.storefrontConfig, store.adminConfig].entries()) {
        wrangler(['deploy', '--config', config, '--tag', plan.version, '--message', `platform-${registry.platformVersion} ${plan.revision}`]);
        result.steps.push(index ? 'deploy-admin' : 'deploy-storefront'); save();
      }
      result.status = 'deployed-awaiting-live-verification'; save();
    }
    journal.status = 'deployed-awaiting-live-verification';
  } catch (error) {
    journal.status = 'failed';
    // Never claim success or automatically restore a DB over new customer orders.
    journal.error = error.message; throw error;
  } finally { journal.finishedAt = new Date().toISOString(); save(); }
  return { directory: dir, journal };
}
function main() {
  const args = process.argv.slice(2), allowed = new Set(['--store', '--revision', '--verified-revision', '--execute']);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    assert(allowed.has(args[i]) && options[args[i]] === undefined, `Unknown or repeated argument: ${args[i]}`);
    const key = args[i]; options[key] = key === '--execute' ? true : args[++i];
  }
  const registry = readRegistry();
  const plan = makePlan(registry, options['--store'], options['--revision'], fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim(), options['--verified-revision']);
  console.log(JSON.stringify(plan, null, 2));
  if (options['--execute']) {
    assert(/^[a-f0-9]{32}$/.test(process.env.CLOUDFLARE_ACCOUNT_ID || ''), 'Explicit CLOUDFLARE_ACCOUNT_ID is required');
    console.log(JSON.stringify(executePlan(plan, registry), null, 2));
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
