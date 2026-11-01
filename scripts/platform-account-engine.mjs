
import{client,query,ReleaseFailure,safeError}from'./platform-publish-common.mjs';
const flat=value=>value.flatMap(r=>r.results||[]);
export async function applyAccountJob(cf,job,account,snapshot){
 if(!['create','reset','disable','enable'].includes(job.operation))throw new ReleaseFailure('invalid_account_operation');
 if(['create','reset'].includes(job.operation)&&(!/^scrypt\$[a-f0-9]{64}$/.test(job.password_hash||'')||!/^[a-f0-9]{64}$/.test(job.password_salt||'')))throw new ReleaseFailure('invalid_credential_payload');
 const db=snapshot.databaseId,q=async(sql,params=[])=>flat(await cf.query(db,sql,params));
 await q('CREATE TABLE IF NOT EXISTS platform_admin_account_links(platform_account_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL UNIQUE,created_at INTEGER NOT NULL,FOREIGN KEY(user_id) REFERENCES admin_users(id))');
 let link=(await q('SELECT user_id FROM platform_admin_account_links WHERE platform_account_id=?',[account.id]))[0];
 let user;
 if(job.operation==='create'){
  if(!link){
   user=(await q('SELECT id,email,password_hash,password_salt,created_at FROM admin_users WHERE email=? COLLATE NOCASE',[account.email]))[0];
   if(user&&(user.password_hash!==job.password_hash||user.password_salt!==job.password_salt||user.created_at!==job.created_at))throw new ReleaseFailure('email_already_exists');
   if(!user){await q('INSERT INTO admin_users(email,name,password_hash,password_salt,is_owner,active,must_change_password,password_expires_at,auth_version,created_at,updated_at) VALUES(?,?,?,?,1,1,0,NULL,1,?,?)',[account.email,account.name,job.password_hash,job.password_salt,job.created_at,job.created_at]);user=(await q('SELECT id,email FROM admin_users WHERE email=? COLLATE NOCASE',[account.email]))[0]}
   if(!user?.id)throw new ReleaseFailure('account_create_not_verified');
   await q('INSERT INTO platform_admin_account_links(platform_account_id,user_id,created_at) VALUES(?,?,?)',[account.id,user.id,Date.now()]);
   link={user_id:user.id};
  }else{
   await q('UPDATE admin_users SET password_hash=?,password_salt=?,active=1,must_change_password=0,password_expires_at=NULL,auth_version=auth_version+1,updated_at=? WHERE id=? AND is_owner=1',[job.password_hash,job.password_salt,Date.now(),link.user_id]);
  }
 }else{
  if(!link||Number(link.user_id)!==Number(account.user_id))throw new ReleaseFailure('account_identity_mismatch');
  user=(await q('SELECT id,email,is_owner FROM admin_users WHERE id=?',[link.user_id]))[0];
  if(!user||user.email.toLowerCase()!==account.email.toLowerCase()||!user.is_owner)throw new ReleaseFailure('account_identity_mismatch');
  if(job.operation==='reset')await q('UPDATE admin_users SET password_hash=?,password_salt=?,must_change_password=0,password_expires_at=NULL,auth_version=auth_version+1,updated_at=? WHERE id=?',[job.password_hash,job.password_salt,Date.now(),link.user_id]);
  else await q('UPDATE admin_users SET active=?,auth_version=auth_version+1,updated_at=? WHERE id=?',[job.operation==='enable'?1:0,Date.now(),link.user_id]);
 }
 await q('UPDATE admin_sessions SET revoked_at=? WHERE user_id=?',[Date.now(),link.user_id]);
 const verified=(await q('SELECT id,email,active,is_owner,password_hash,must_change_password,password_expires_at FROM admin_users WHERE id=?',[link.user_id]))[0];
 if(!verified||verified.email.toLowerCase()!==account.email.toLowerCase()||!verified.is_owner||job.operation==='disable'&&verified.active!==0||job.operation==='enable'&&verified.active!==1||['create','reset'].includes(job.operation)&&(verified.password_hash!==job.password_hash||verified.must_change_password!==0||verified.password_expires_at!=null))throw new ReleaseFailure('account_change_not_verified');
 await q('INSERT INTO admin_audit_log(actor_id,actor_label,action,target,status,details,created_at) VALUES(NULL,?,?,?,?,?,?)',['مالك المنصة','platform.admin_account.'+job.operation,String(link.user_id),200,JSON.stringify({accountId:account.id,jobId:job.id}),Date.now()]);
 return{userId:Number(link.user_id),status:verified.active?'active':'disabled'};
}
export async function runAccountJobs(cf=client()){
 // A crashed mutation is not retried automatically; the administrator must review it.
 await query(cf,"UPDATE platform_account_jobs SET status='failed',stage='needs_review',error_code='runner_interrupted',password_hash=NULL,password_salt=NULL,updated_at=? WHERE status='running' AND updated_at<?",[Date.now(),Date.now()-3600000]);
 for(let count=0;count<20;count++){
  const job=(await query(cf,"UPDATE platform_account_jobs SET status='running',stage='preflight',updated_at=? WHERE id=(SELECT id FROM platform_account_jobs WHERE status='queued' ORDER BY created_at LIMIT 1) AND status='queued' RETURNING *",[Date.now()]))[0];if(!job)break;
  try{
   if(job.expires_at<Date.now())throw new ReleaseFailure('account_request_expired');
   const store=(await query(cf,'SELECT * FROM platform_stores WHERE id=?',[job.store_id]))[0],r=JSON.parse(store?.resources_json||'{}'),snapshot=JSON.parse(job.snapshot_json);
   if(store?.status!=='active'||['databaseId','mediaBucket','adminWorker'].some(key=>!snapshot[key]||snapshot[key]!==r[key]))throw new ReleaseFailure('store_resources_changed');
   const other=(await query(cf,"SELECT id FROM platform_stores WHERE id<>? AND json_extract(resources_json,'$.databaseId')=? LIMIT 1",[job.store_id,snapshot.databaseId]))[0];if(other)throw new ReleaseFailure('cross_store_resource_collision');
   const settings=await cf.call('/workers/scripts/'+snapshot.adminWorker+'/settings'),bindings=settings.bindings||[];
   if(bindings.find(b=>b.name==='DB')?.id!==snapshot.databaseId||bindings.find(b=>b.name==='MEDIA')?.bucket_name!==snapshot.mediaBucket||bindings.find(b=>b.name==='APP_SURFACE')?.text!=='admin')throw new ReleaseFailure('resource_identity_mismatch');
   const account=(await query(cf,'SELECT * FROM platform_admin_accounts WHERE id=? AND store_id=?',[job.account_id,job.store_id]))[0];if(!account)throw new ReleaseFailure('account_identity_mismatch');
   const result=await applyAccountJob(cf,job,account,snapshot),now=Date.now();
   await query(cf,'UPDATE platform_admin_accounts SET user_id=?,status=?,updated_at=? WHERE id=? AND store_id=?',[result.userId,result.status,now,account.id,job.store_id]);
   await query(cf,"UPDATE platform_account_jobs SET status='succeeded',stage='complete',error_code=NULL,password_hash=NULL,password_salt=NULL,updated_at=? WHERE id=?",[now,job.id]);
   await query(cf,'INSERT INTO platform_audit(id,actor,action,store_id,details_json,created_at) VALUES(?,?,?,?,?,?)',[crypto.randomUUID(),job.requested_by,'admin_account.'+job.operation+'_completed',job.store_id,JSON.stringify({accountId:account.id,jobId:job.id}),now]);
   console.log(JSON.stringify({accountJob:job.id,store:job.store_id,status:'succeeded'}));
  }catch(error){
   const code=safeError(error);await query(cf,"UPDATE platform_account_jobs SET status='failed',stage='needs_review',error_code=?,password_hash=NULL,password_salt=NULL,updated_at=? WHERE id=?",[code,Date.now(),job.id]);
   if(job.operation==='create')await query(cf,"UPDATE platform_admin_accounts SET status='failed',updated_at=? WHERE id=? AND user_id IS NULL",[Date.now(),job.account_id]);
   await query(cf,'INSERT INTO platform_audit(id,actor,action,store_id,details_json,created_at) VALUES(?,?,?,?,?,?)',[crypto.randomUUID(),job.requested_by,'admin_account.failed',job.store_id,JSON.stringify({accountId:job.account_id,jobId:job.id,code}),Date.now()]);
   console.log(JSON.stringify({accountJob:job.id,store:job.store_id,status:'failed',code}));
  }
 }
}
