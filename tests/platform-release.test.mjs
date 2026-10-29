import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readRegistry, selectStores, makePlan, executePlan } from '../scripts/platform-release.mjs';
import { ROOT } from '../scripts/platform-release.mjs';
const revision = 'a'.repeat(40);
test('registry matches independent real Worker, DB and media configs', () => {
  const registry = readRegistry();
  assert.deepEqual(registry.stores.map(s => s.id), ['manar', 'rokon']);
  assert.equal(new Set(registry.stores.map(s => s.database.id)).size, 2);
  assert.throws(() => selectStores(registry), /Explicit/);
  assert.throws(() => selectStores(registry, 'missing'), /Unknown/);
  assert.throws(() => selectStores(registry, 'manar,manar'), /Duplicate/);
});
test('plans are explicit and fail closed without exact private-preview attestation', () => {
  const registry = readRegistry();
  assert.throws(() => makePlan(registry, 'manar', 'main', '1.1.4'), /immutable/);
  assert.equal(makePlan(registry, 'manar', revision, '1.1.4').stores[0].ready, false);
  assert.equal(makePlan(registry, 'manar', revision, '1.1.4', 'b'.repeat(40)).stores[0].ready, false);
  assert.equal(makePlan(registry, 'manar', revision, '1.1.4', revision).stores[0].ready, true);
  const plan = makePlan(registry, 'all', revision, '1.1.4', revision);
  assert.equal(plan.stores[1].blockedReason, 'live_resource_mismatch');
  registry.stores[1].release.enabled = true;
  assert.equal(makePlan(registry, 'rokon', revision, '1.1.4', revision).stores[0].ready, false);
  let calls = 0;
  assert.throws(() => executePlan(plan, registry, { command: () => { calls++; } }), /Release blocked/);
  assert.equal(calls, 0);
});
function fixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-release-'));
  try {
    fs.mkdirSync(path.join(root, 'node_modules/wrangler/bin'), { recursive: true });
    fs.mkdirSync(path.join(root, 'dist/server'), { recursive: true });
    fs.writeFileSync(path.join(root, 'node_modules/wrangler/bin/wrangler.js'), '');
    fs.writeFileSync(path.join(root, 'dist/server/index.js'), '');
    const registry = readRegistry(); registry.stores.forEach(s => { s.release.enabled = true; delete s.runtimeAudit; });
    fn(root, registry);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
test('backs up every target before migrations, uses explicit configs, preserves partial failure journal', () => fixture((root, registry) => {
  const calls = [], outputDir = path.join(root, 'artifacts');
  const command = (binary, args) => {
    if (binary === 'git') return args[0] === 'rev-parse' ? revision : '';
    const a = args.slice(1); calls.push(a);
    if (a[1] === 'export') fs.writeFileSync(a.at(-1), '-- backup');
    if (a[0] === 'versions' || a[0] === 'deployments') return '[]';
    if (a[0] === 'deploy' && a.includes('wrangler.admin.jsonc')) throw new Error('simulated deploy failure');
    return '';
  };
  assert.throws(() => executePlan(makePlan(registry, 'all', revision, '1.1.4', revision), registry, { root, outputDir, command }), /simulated/);
  const firstMigration = calls.findIndex(a => a[1] === 'migrations');
  assert.equal(calls.slice(0, firstMigration).filter(a => a[1] === 'export').length, 2);
  assert.ok(calls.every(a => a.includes('--config')));
  assert.ok(!calls.some(a => a[0] === 'deploy' && a.includes('wrangler.rokon.jsonc')));
  const journal = JSON.parse(fs.readFileSync(path.join(outputDir, 'release.json')));
  assert.equal(journal.status, 'failed');
  assert.ok(journal.results[0].steps.includes('deploy-storefront'));
  assert.ok(!journal.results[0].steps.includes('deploy-admin'));
}));
test('failed or missing backup aborts before any migrations or deployment', () => fixture((root, registry) => {
  const calls = [];
  const command = (binary, args) => {
    if (binary === 'git') return args[0] === 'rev-parse' ? revision : '';
    calls.push(args); return '';
  };
  assert.throws(() => executePlan(makePlan(registry, 'manar', revision, '1.1.4', revision), registry, { root, command }), /backup is missing/);
  assert.equal(calls.length, 1);
}));
test('successful deployment remains awaiting live verification, never claims observed installed version', () => fixture((root, registry) => {
  const command = (binary, args) => {
    if (binary === 'git') return args[0] === 'rev-parse' ? revision : '';
    const a = args.slice(1);
    if (a[1] === 'export') fs.writeFileSync(a.at(-1), '-- backup');
    return a[0] === 'versions' || a[0] === 'deployments' ? '[]' : '';
  };
  const { journal } = executePlan(makePlan(registry, 'manar', revision, '1.1.4', revision), registry, { root, command });
  assert.equal(journal.status, 'deployed-awaiting-live-verification');
  assert.equal(journal.results[0].steps.length, 5);
}));
test('wrong commit and dirty checkout cannot call Cloudflare', () => fixture((root, registry) => {
  const plan = makePlan(registry, 'manar', revision, '1.1.4', revision);
  for (const dirty of [false, true]) {
    let remoteCalls = 0;
    const command = (binary, args) => {
      if (binary !== 'git') { remoteCalls++; return ''; }
      return args[0] === 'rev-parse' ? (dirty ? revision : 'b'.repeat(40)) : ' M wrangler.jsonc';
    };
    assert.throws(() => executePlan(plan, registry, { root, command }), dirty ? /clean checkout/ : /does not match/);
    assert.equal(remoteCalls, 0);
  }
}));
test('misbound DB, cross-store bucket and unsafe config paths are rejected before planning', () => fixture((root) => {
  fs.mkdirSync(path.join(root, 'platform'));
  for (const filename of ['wrangler.jsonc', 'wrangler.admin.jsonc', 'wrangler.rokon.jsonc', 'wrangler.rokon.admin.jsonc']) {
    fs.copyFileSync(path.join(ROOT, filename), path.join(root, filename));
  }
  const original = JSON.parse(fs.readFileSync(path.join(ROOT, 'platform/stores.json')));
  const save = value => fs.writeFileSync(path.join(root, 'platform/stores.json'), JSON.stringify(value));
  const unsafe = structuredClone(original); unsafe.stores[0].storefrontConfig = '../wrangler.jsonc'; save(unsafe);
  assert.throws(() => readRegistry(root), /Unsafe/);
  const db = structuredClone(original); db.stores[1].database.id = db.stores[0].database.id; save(db);
  assert.throws(() => readRegistry(root), /database mismatch/);
  save(original);
  const configPath = path.join(root, 'wrangler.rokon.admin.jsonc');
  const config = JSON.parse(fs.readFileSync(configPath)); config.r2_buckets[0].bucket_name = 'manar-store-media';
  fs.writeFileSync(configPath, JSON.stringify(config));
  assert.throws(() => readRegistry(root), /media mismatch/);
}));
