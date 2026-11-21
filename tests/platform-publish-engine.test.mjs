import test from 'node:test';import assert from 'node:assert/strict';
import{executeTargets}from'../scripts/platform-publish-engine.mjs';
import{deployEnvironment,verifyBindings,assertArchivePaths,storefrontConfig}from'../scripts/platform-publish-common.mjs';
test('all preflights finish before activation and any failure prevents every deployment',async()=>{let activated=0;await assert.rejects(executeTargets([{id:'one'},{id:'two'}],{async prepare(t){if(t.id==='two')throw Error('mismatch');return t},async activate(){activated++}}));assert.equal(activated,0)});
test('only selected targets run and independent failures remain visible',async()=>{const stages=[],failures=[];const result=await executeTargets([{id:'one'},{id:'three'}],{async prepare(t){stages.push('prepare-'+t.id);return t},async activate(t){stages.push('activate-'+t.id);if(t.id==='one')throw Error('failed');return {}},async failed(t){failures.push(t.id)}});assert.deepEqual(stages,['prepare-one','prepare-three','activate-one','activate-three']);assert.deepEqual(failures,['one']);assert.deepEqual(result.map(r=>r.ok),[false,true])});
test('coordinator CI worker identity is never passed to merchant version upload',()=>{const env=deployEnvironment({PLATFORM_DEPLOY_TOKEN:'secret',WRANGLER_CI_OVERRIDE_NAME:'runner',WRANGLER_CI_MATCH_TAG:'runner-tag',WRANGLER_ENV:'production',SAFE:'kept'});assert.equal(env.WRANGLER_CI_OVERRIDE_NAME,undefined);assert.equal(env.WRANGLER_CI_MATCH_TAG,undefined);assert.equal(env.WRANGLER_ENV,undefined);assert.equal(env.SAFE,'kept');assert.equal(env.CLOUDFLARE_API_TOKEN,'secret')});
test('resource identity and unreviewed service bindings fail closed',()=>{const snapshot={databaseId:'owned-db',mediaBucket:'owned-media'},settings={bindings:[{name:'DB',type:'d1',id:'owned-db'},{name:'MEDIA',type:'r2_bucket',bucket_name:'owned-media'}]};assert.doesNotThrow(()=>verifyBindings(settings,snapshot));assert.throws(()=>verifyBindings(settings,{...snapshot,databaseId:'other-db'}));assert.throws(()=>verifyBindings({bindings:[...settings.bindings,{name:'OTHER',type:'service',service:'other-store'}]},snapshot))});
test('artifacts cannot escape extraction directory or replace engine code',()=>{for(const value of ['../secret','/absolute','dist/../../secret','scripts/runner.js','dist\\escape'])assert.throws(()=>assertArchivePaths(value));assert.doesNotThrow(()=>assertArchivePaths('dist/\ndist/server/index.js\nVERSION\n'))});

test('live check follows only a store domain redirect of the same page (Rokon on its own domain)',async()=>{
 const {liveFetch}=await import('../scripts/platform-publish-engine.mjs');
 const seen=[];const res=(status,location)=>({status,ok:status>=200&&status<300,headers:{get:()=>location},body:{cancel:async()=>{}}});
 const fake=routes=>async url=>{seen.push(String(url));return routes[String(url)]||res(404)};
 const start=new URL('https://rokon-store.example.workers.dev/?release-check=1');
 let r=await liveFetch(start,'storefront',fake({[start]:res(308,'https://www.rokon-home.com/?release-check=1'),'https://www.rokon-home.com/?release-check=1':res(200)}));
 assert.equal(r.status,200);
 seen.length=0;r=await liveFetch(start,'storefront',fake({[start]:res(308,'https://evil.example/elsewhere')}));
 assert.equal(r.status,308,'a redirect to another page is not followed');assert.equal(seen.length,1);
 r=await liveFetch(start,'storefront',fake({[start]:res(302,'https://www.rokon-home.com/?release-check=1')}));
 assert.equal(r.status,302,'only permanent redirects');
 r=await liveFetch(new URL('https://a.example/admin/login'),'admin',fake({'https://a.example/admin/login':res(308,'https://b.example/admin/login')}));
 assert.equal(r.status,308,'admin checks are unchanged');
});
