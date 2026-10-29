const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(name) {
  const filename = path.join(__dirname, '..', 'worker', name + '.ts');
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} }; new Function('module', 'exports', 'require', source)(module, module.exports, require); return module.exports;
}
const { previewRoute, previewTarget, previewHeaders } = load('preview-policy');
const { previewIdentity } = load('preview-access');
const req = (path, method = 'GET') => new Request('https://preview.example' + path, { method });
test('writes, personal/admin APIs, service workers and account screens are denied', () => {
  for (const method of ['POST','PUT','PATCH','DELETE','OPTIONS']) assert.equal(previewRoute(req('/api/orders', method)), 'blocked');
  for (const route of ['/api/admin/orders','/api/account','/api/push/config','/account','/admin','/sw.js','/manifest.webmanifest','/media%2fprivate']) assert.equal(previewRoute(req(route)), 'blocked');
  assert.equal(previewRoute(req('/api/catalog?includeInactive=true')), 'proxy');
  assert.equal(previewRoute(req('/search?q=boxes')), 'app');
  assert.equal(previewRoute(req('/category/boxes')), 'app');
});
test('public proxy pins production origin and drops arbitrary query selectors', () => {
  assert.equal(previewTarget(req('/api/catalog?admin=1&includeInactive=true')).href, 'https://manarstore.ps/api/catalog');
  assert.equal(previewTarget(req('/_media/thumbnail?src=%2Fmedia%2Fp.webp&width=384')).origin, 'https://manarstore.ps');
  assert.throws(() => previewTarget(req('/_media/thumbnail?src=https://evil.example/img&width=384')));
  assert.throws(() => previewTarget(req('/_media/thumbnail?src=%2Fmedia%2Fp.webp&width=999')));
});
test('all responses suppress indexing, caching, cookies, remote tracking and service workers', () => {
  const headers = previewHeaders({ 'set-cookie':'session=private', 'cache-control':'public', 'content-encoding':'gzip' });
  assert.equal(headers.get('set-cookie'), null);
  assert.equal(headers.get('content-encoding'), 'gzip');
  assert.equal(headers.get('cache-control'), 'private, no-store');
  assert.match(headers.get('x-robots-tag'), /noindex/);
  assert.match(headers.get('content-security-policy'), /connect-src 'self'/);
  assert.match(headers.get('content-security-policy'), /worker-src 'none'/);
});
test('missing or forged Access identity never reaches certificate fetch or app', async () => {
  let calls = 0; const fetcher = async () => { calls++; throw new Error('unexpected'); };
  assert.equal(await previewIdentity(req('/'), {}, fetcher), null);
  const env = { PREVIEW_ACCESS_TEAM:'team',PREVIEW_ACCESS_AUD:'aud',PREVIEW_ALLOWED_EMAILS:'owner@example.com' };
  assert.equal(await previewIdentity(new Request('https://preview.example', { headers:{ 'cf-access-authenticated-user-email':'owner@example.com' } }), env, fetcher), null);
  assert.equal(await previewIdentity(new Request('https://preview.example', { headers:{ 'cf-access-jwt-assertion':'forged' } }), env, fetcher), null);
  assert.equal(calls, 0);
});
test('Access verifies signature, owner, audience and expiry for headers and cookies', async () => {
  const keys = await crypto.subtle.generateKey({ name:'RSASSA-PKCS1-v1_5',hash:'SHA-256',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]) }, true, ['sign','verify']);
  const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey); jwk.kid='test-key';
  const base = { iss:'https://team.cloudflareaccess.com',aud:['aud'],email:'owner@example.com',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300 };
  const token = async extra => {
    const h = Buffer.from(JSON.stringify({ alg:'RS256',kid:'test-key' })).toString('base64url');
    const p = Buffer.from(JSON.stringify({...base,...extra})).toString('base64url');
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(h+'.'+p));
    return h+'.'+p+'.'+Buffer.from(signature).toString('base64url');
  };
  const env = { PREVIEW_ACCESS_TEAM:'team',PREVIEW_ACCESS_AUD:'aud',PREVIEW_ALLOWED_EMAILS:'owner@example.com' };
  const fetcher = async (url, options) => { assert.equal(url,'https://team.cloudflareaccess.com/cdn-cgi/access/certs'); assert.equal(options.redirect,'manual'); return Response.json({keys:[jwk]}); };
  const valid = await token({});
  for (const headers of [{ 'cf-access-jwt-assertion':valid },{cookie:'CF_Authorization='+valid}]) assert.equal(await previewIdentity(new Request('https://preview.example',{headers}),env,fetcher),'owner@example.com');
  for (const extra of [{aud:['wrong']},{exp:0},{email:'stranger@example.com'},{iss:'https://evil.example'},{nbf:Date.now()/1000+600}]) assert.equal(await previewIdentity(new Request('https://preview.example',{headers:{'cf-access-jwt-assertion':await token(extra)}}),env,fetcher),null);
  const tampered=valid.slice(0,-20)+'A'.repeat(20);
  assert.equal(await previewIdentity(new Request('https://preview.example',{headers:{'cf-access-jwt-assertion':tampered}}),env,fetcher),null);
});
test('preview has no database, storage, AI or cron and always authenticates assets', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname,'../wrangler.preview.jsonc')));
  for (const binding of ['d1_databases','r2_buckets','ai','triggers','services']) assert.equal(config[binding],undefined);
  assert.equal(config.assets.run_worker_first,true);
  assert.equal(config.preview_urls,false);
});
test('entry authenticates before asset serving and preserves compressed asset headers', async () => {
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname,'../worker/preview.ts'),'utf8'), { compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022} }).outputText;
  let authenticated=false, assetCalls=0, appCalls=0;
  const module={exports:{}};
  const mockedRequire=name=>{
    if(name==='./preview-access')return {previewIdentity:async()=>authenticated?'owner@example.com':null};
    if(name==='./preview-policy')return load('preview-policy');
    if(name==='vinext/server/app-router-entry')return {default:{fetch:async()=>{appCalls++;return new Response('<html><body>Store</body></html>',{headers:{'content-type':'text/html','content-encoding':'gzip'}})}}};
    throw Error(name);
  };
  new Function('module','exports','require',source)(module,module.exports,mockedRequire);
  const entry=module.exports.default;
  const env={ASSETS:{fetch:async()=>{assetCalls++;return new Response('compressed-js',{headers:{'content-type':'application/javascript','content-encoding':'gzip'}})}}};
  assert.equal((await entry.fetch(req('/assets/index.js'),env,{})).status,401);
  assert.equal(assetCalls,0);
  authenticated=true;
  const asset=await entry.fetch(req('/assets/index.js'),env,{});
  assert.equal(assetCalls,1);assert.equal(appCalls,0);assert.equal(asset.headers.get('content-encoding'),'gzip');
  const page=await entry.fetch(req('/'),env,{});
  assert.equal(page.headers.get('content-encoding'),null);assert.match(await page.text(),/نسخة معاينة خاصة/);
  assert.equal((await entry.fetch(req('/api/orders','POST'),env,{})).status,403);
  assert.equal((await entry.fetch(req('/api/admin/orders'),env,{})).status,403);
  assert.equal(appCalls,1);
});
