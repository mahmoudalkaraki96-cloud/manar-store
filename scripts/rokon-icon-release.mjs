import fs from 'node:fs';
import{cloudflareClient}from'./platform-cloudflare.mjs';
const account='008c61df8c322c27b8d1c1137922e328',name='rokon-store',database='a5c50923-c7ec-4ede-95b3-d19b93914902',bucket='rokon-store-media',origin='https://rokon-store.mahmoud-alkaraki96.workers.dev';
const client=cloudflareClient(account,process.env.CLOUDFLARE_API_TOKEN);
function verifyBindings(bindings){if(bindings.find(b=>b.name==='DB')?.id!==database||bindings.find(b=>b.name==='MEDIA')?.bucket_name!==bucket)throw Error('Rokon resource isolation mismatch');}
if(process.argv[2]==='preflight'){
 const config=JSON.parse(fs.readFileSync('wrangler.rokon.jsonc','utf8'));
 if(config.name!==name||config.d1_databases[0].database_id!==database||config.r2_buckets[0].bucket_name!==bucket)throw Error('Unexpected deployment target');
 const settings=await client.call('/workers/scripts/'+name+'/settings');verifyBindings(settings.bindings);
 const expected=new Set(['DB','MEDIA','IMAGES','ASSETS']);
 for(const binding of settings.bindings)if(!['plain_text','json','secret_text'].includes(binding.type)&&!expected.has(binding.name))throw Error('Unreviewed runtime binding: '+binding.name);
 const scheduleResult=await client.call('/workers/scripts/'+name+'/schedules');const schedules=Array.isArray(scheduleResult)?scheduleResult:scheduleResult.schedules||[];
 config.triggers={crons:schedules.map(s=>s.cron)};config.assets.run_worker_first=['/_store/favicon'];
 fs.writeFileSync('.rokon-icon.generated.jsonc',JSON.stringify(config,null,2));
 const live=await client.call('/workers/scripts/'+name+'/deployments');console.log(JSON.stringify({target:name,database,bucket,previousVersions:live.deployments?.[0]?.versions?.map(v=>v.version_id)||[],schedules:config.triggers.crons,migrations:false,adminDeployment:false}));
}else if(process.argv[2]==='verify'){
 const settings=await client.call('/workers/scripts/'+name+'/settings');verifyBindings(settings.bindings);
 const profile=(await(await fetch(origin+'/api/storefront')).json()).settings;
 const icon=await fetch(origin+'/_store/favicon?v=1.1.5',{redirect:'manual'});
 if(icon.status!==302||icon.headers.get('location')!==new URL(profile.faviconUrl||profile.logoUrl,origin).toString())throw Error('Configured icon mismatch');
 const image=await fetch(icon.headers.get('location'));if(!image.ok||!image.headers.get('content-type')?.startsWith('image/'))throw Error('Icon image unavailable');
 const catalog=await(await fetch(origin+'/api/catalog')).json();if(catalog.products?.length!==17)throw Error('Unexpected Rokon catalog count');
 console.log(JSON.stringify({icon:icon.headers.get('location'),imageStatus:image.status,products:catalog.products.length,name:profile.storeName,isolation:'verified'}));
}else throw Error('Expected preflight or verify');
