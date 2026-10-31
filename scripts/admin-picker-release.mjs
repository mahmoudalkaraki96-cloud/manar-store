import fs from 'node:fs';import{execFileSync}from'node:child_process';import{cloudflareClient}from'./scripts/platform-cloudflare.mjs';
const account='008c61df8c322c27b8d1c1137922e328',name='manar-store-admin',database='4afe4c16-e513-43ac-a397-26fa4141e5c9',bucket='manar-store-media',cf=cloudflareClient(account,process.env.CLOUDFLARE_API_TOKEN);
function verify(settings){const b=settings.bindings||[];if(b.find(b=>b.name==='DB')?.id!==database||b.find(b=>b.name==='MEDIA')?.bucket_name!==bucket||b.find(b=>b.name==='APP_SURFACE')?.text!=='admin')throw Error('Admin identity mismatch');for(const binding of b)if(!['plain_text','json','secret_text'].includes(binding.type)&&!['DB','MEDIA','AI','IMAGES','ASSETS'].includes(binding.name))throw Error('Unreviewed admin binding')}
try{
 if(fs.readFileSync('VERSION','utf8').trim()!=='1.1.6')throw Error('Unexpected release');
 const config=JSON.parse(fs.readFileSync('wrangler.admin.jsonc','utf8'));if(config.name!==name)throw Error('Unexpected admin target');
 const settings=await cf.call('/workers/scripts/'+name+'/settings');verify(settings);
 const previous=await cf.call('/workers/scripts/'+name+'/deployments');console.log(JSON.stringify({target:name,previousVersions:previous.deployments[0].versions,migrations:false,storefrontDeployment:false}));
 config.vars={APP_SURFACE:'admin'};config.assets.run_worker_first=['/_store/favicon'];fs.writeFileSync('.admin-picker.generated.jsonc',JSON.stringify(config));
 const env={...process.env,CLOUDFLARE_ACCOUNT_ID:account};for(const key of Object.keys(env))if(key.startsWith('WRANGLER_CI_'))delete env[key];
 let output;try{output=execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','versions','upload','--config','.admin-picker.generated.jsonc','--keep-vars','--tag','1.1.6','--message','Fix category picker keyboard dismissal'],{env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000})}catch{throw Error('Admin upload failed')}
 const id=output.match(/Worker Version ID:\s*([a-f0-9-]{36})/i)?.[1];if(!id)throw Error('Missing uploaded version');verify(await cf.call('/workers/scripts/'+name+'/settings'));
 await cf.call('/workers/scripts/'+name+'/deployments','POST',{strategy:'percentage',versions:[{version_id:id,percentage:100}]});
 verify(await cf.call('/workers/scripts/'+name+'/settings'));
 const origin='https://admin.manarstore.ps';let verified=false;for(let i=0;i<6&&!verified;i++){const [login,privateApi]=await Promise.all([fetch(origin+'/admin/login',{redirect:'manual'}),fetch(origin+'/api/admin/orders',{redirect:'manual'})]);verified=login.status===200&&privateApi.status===401;await login.body?.cancel();await privateApi.body?.cancel();if(!verified)await new Promise(r=>setTimeout(r,5000))}if(!verified)throw Error('Admin live verification failed');
 const control='b8376540-1e02-47dd-b4a3-635b1b5b39fd';await cf.query(control,"UPDATE platform_stores SET resources_json=json_set(resources_json,'$.adminVersion','1.1.6','$.adminRevision',?),updated_at=? WHERE id='manar'",[process.env.GITHUB_SHA,Date.now()]);
 console.log(JSON.stringify({target:name,version:'1.1.6',workerVersion:id,verified:true,migrations:false}));
}catch(error){console.error(error.code||error.message);process.exitCode=1}
