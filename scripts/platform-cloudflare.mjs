export class CloudflareError extends Error{constructor(code,status){super(code);this.code=code;this.status=status}}
export function cloudflareClient(account,token,fetcher=fetch){
 if(!/^[a-f0-9]{32}$/.test(account||'')||!token)throw new CloudflareError('cloudflare_credentials_missing',0);
 async function call(route,method='GET',body){
  const response=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+account+route,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
  let data;try{data=await response.json()}catch{throw new CloudflareError('cloudflare_invalid_response',response.status)}
  if(!response.ok||data.success===false){const error=new CloudflareError(response.status===403?'cloudflare_permission_denied':'cloudflare_request_failed',response.status);error.apiErrors=(data.errors||[]).map(e=>({code:e.code,message:String(e.message||'').slice(0,400)}));throw error}
  return data.result;
 }
 async function query(database,sql,params=[]){
  if(!/^[a-f0-9-]{36}$/.test(database))throw new CloudflareError('invalid_database_id',0);
  const result=await call('/d1/database/'+database+'/query','POST',{sql,params});
  if(!Array.isArray(result)||result.some(r=>r.success===false))throw new CloudflareError('database_query_failed',0);
  return result;
 }
 return {call,query};
}
export function splitSql(source){
 const result=[];let current='',quote=null,lineComment=false,blockComment=false;
 for(let i=0;i<source.length;i++){const c=source[i],n=source[i+1];if(lineComment){if(c==='\n'){lineComment=false;current+='\n'}continue}if(blockComment){if(c==='*'&&n==='/'){blockComment=false;i++}continue}if(!quote&&c==='-'&&n==='-'){lineComment=true;i++;continue}if(!quote&&c==='/'&&n==='*'){blockComment=true;i++;continue}current+=c;if(quote){if(c===quote){if(n===quote){current+=n;i++}else quote=null}}else if(c==="'"||c==='"'||c==='`')quote=c;else if(c===';'){if(current.trim())result.push(current.trim());current=''}}
 if(quote||blockComment)throw new Error('invalid_schema_sql');if(current.trim())result.push(current.trim());return result;
}
export function tenantNames(id){if(!/^[a-z][a-z0-9-]{2,30}$/.test(id)||id.endsWith('-')||id.includes('--'))throw new Error('invalid_store_id');return {databaseName:'tenant-'+id+'-db',mediaBucket:'tenant-'+id+'-media',storefrontWorker:'tenant-'+id+'-store',adminWorker:'tenant-'+id+'-admin'}}
export function assertManagedStore(store){if(!store||store.management_mode!=='managed'||store.status==='active')throw new Error('existing_store_cannot_be_initialized');return tenantNames(store.id)}
export function tenantConfig(names,resources,surface,auth,subdomain){
 if(resources.databaseName!==names.databaseName||resources.mediaBucket!==names.mediaBucket||!resources.databaseId)throw new Error('resource_identity_mismatch');
 return {name:surface==='admin'?names.adminWorker:names.storefrontWorker,main:'./dist/server/index.js',compatibility_date:'2026-08-22',compatibility_flags:['nodejs_compat'],no_bundle:true,rules:[{type:'ESModule',globs:['**/*.js','**/*.mjs']}],assets:{directory:'./dist/client',binding:'ASSETS',run_worker_first:['/manifest.webmanifest','/admin-manifest.webmanifest']},workers_dev:true,preview_urls:false,d1_databases:[{binding:'DB',database_name:names.databaseName,database_id:resources.databaseId,migrations_dir:'./drizzle'}],r2_buckets:[{binding:'MEDIA',bucket_name:names.mediaBucket}],images:{binding:'IMAGES'},...(surface==='admin'?{ai:{binding:'AI'}}:{}),vars:{APP_SURFACE:surface,STORE_KEY:resources.storeId,...(surface==='admin'?{ADMIN_OWNER_EMAIL:resources.ownerEmail||auth.defaultOwnerEmail,ADMIN_OWNER_CF_EMAIL:auth.cloudflareEmail,ADMIN_CF_TEAM:auth.team,ADMIN_CF_AUD:auth.audience}:{})},observability:{enabled:true},...(surface==='storefront'?{triggers:{crons:['* * * * *']}}:{})};
}
