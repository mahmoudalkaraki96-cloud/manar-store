
import{client,query,ReleaseFailure,safeError}from'./platform-publish-common.mjs';
const flat=value=>value.flatMap(r=>r.results||[]);
// The platform API validated the theme against the registry; the runner only accepts the same shape.
function themeValue(json){let theme;try{theme=JSON.parse(json)}catch{throw new ReleaseFailure('invalid_theme_payload')}
 const keys=theme&&typeof theme==='object'?Object.keys(theme).sort().join(','):'';
 if(keys!=='id,radius'||!/^[a-z][a-z0-9-]{1,30}$/.test(theme.id)||!/^[a-z][a-z0-9-]{1,30}$/.test(theme.radius))throw new ReleaseFailure('invalid_theme_payload');
 return JSON.stringify({id:theme.id,radius:theme.radius});
}
// Changes only settings_json.theme in the store's own database and proves every other setting is untouched.
export async function applyThemeJob(cf,job,snapshot){
 const theme=themeValue(job.theme_json),q=async(sql,params=[])=>flat(await cf.query(snapshot.databaseId,sql,params));
 if(!(await q("SELECT name FROM sqlite_master WHERE type='table' AND name='store_profile'")).length)throw new ReleaseFailure('store_profile_missing');
 // Check validity first: SQLite's JSON functions throw on malformed text instead of returning NULL.
 const stored=(await q('SELECT json_valid(settings_json) AS valid FROM store_profile WHERE id=1'))[0];
 if(stored&&stored.valid!==1)throw new ReleaseFailure('store_profile_invalid');
 const before=stored?(await q('SELECT json_remove(settings_json,\'$.theme\') AS rest FROM store_profile WHERE id=1'))[0]:null;
 const now=Date.now();
 if(before)await q("UPDATE store_profile SET settings_json=json_set(settings_json,'$.theme',json(?)),updated_at=? WHERE id=1",[theme,now]);
 else await q("INSERT INTO store_profile(id,settings_json,updated_at) VALUES(1,json_object('theme',json(?)),?)",[theme,now]);
 const after=(await q('SELECT json_extract(settings_json,\'$.theme\') AS theme,json_remove(settings_json,\'$.theme\') AS rest FROM store_profile WHERE id=1'))[0];
 if(!after||JSON.stringify(JSON.parse(after.theme))!==theme||(before?after.rest!==before.rest:after.rest!=='{}'))throw new ReleaseFailure('theme_change_not_verified');
 await q('INSERT INTO admin_audit_log(actor_id,actor_label,action,target,status,details,created_at) VALUES(NULL,?,?,?,?,?,?)',['مالك المنصة','platform.theme.change','store_profile',200,JSON.stringify({jobId:job.id,theme:JSON.parse(theme)}),now]);
}
export async function runThemeJobs(cf=client()){
 // A crashed change is not retried automatically; it needs review.
 await query(cf,"UPDATE platform_theme_jobs SET status='failed',stage='needs_review',error_code='runner_interrupted',updated_at=? WHERE status='running' AND updated_at<?",[Date.now(),Date.now()-3600000]);
 for(let count=0;count<20;count++){
  const job=(await query(cf,"UPDATE platform_theme_jobs SET status='running',stage='preflight',updated_at=? WHERE id=(SELECT id FROM platform_theme_jobs WHERE status='queued' ORDER BY created_at LIMIT 1) AND status='queued' RETURNING *",[Date.now()]))[0];if(!job)break;
  try{
   if(job.expires_at<Date.now())throw new ReleaseFailure('theme_request_expired');
   const store=(await query(cf,'SELECT * FROM platform_stores WHERE id=?',[job.store_id]))[0],r=JSON.parse(store?.resources_json||'{}'),snapshot=JSON.parse(job.snapshot_json);
   if(store?.status!=='active'||['databaseId','mediaBucket','adminWorker'].some(key=>!snapshot[key]||snapshot[key]!==r[key]))throw new ReleaseFailure('store_resources_changed');
   const other=(await query(cf,"SELECT id FROM platform_stores WHERE id<>? AND json_extract(resources_json,'$.databaseId')=? LIMIT 1",[job.store_id,snapshot.databaseId]))[0];if(other)throw new ReleaseFailure('cross_store_resource_collision');
   const settings=await cf.call('/workers/scripts/'+snapshot.adminWorker+'/settings'),bindings=settings.bindings||[];
   if(bindings.find(b=>b.name==='DB')?.id!==snapshot.databaseId||bindings.find(b=>b.name==='MEDIA')?.bucket_name!==snapshot.mediaBucket||bindings.find(b=>b.name==='APP_SURFACE')?.text!=='admin')throw new ReleaseFailure('resource_identity_mismatch');
   await query(cf,"UPDATE platform_theme_jobs SET stage='apply',updated_at=? WHERE id=?",[Date.now(),job.id]);
   await applyThemeJob(cf,job,snapshot);
   const now=Date.now();
   await query(cf,"UPDATE platform_theme_jobs SET status='succeeded',stage='complete',error_code=NULL,updated_at=? WHERE id=?",[now,job.id]);
   await query(cf,'INSERT INTO platform_audit(id,actor,action,store_id,details_json,created_at) VALUES(?,?,?,?,?,?)',[crypto.randomUUID(),job.requested_by,'theme.change_completed',job.store_id,JSON.stringify({jobId:job.id,theme:JSON.parse(job.theme_json)}),now]);
   console.log(JSON.stringify({themeJob:job.id,store:job.store_id,status:'succeeded'}));
  }catch(error){
   const code=safeError(error);await query(cf,"UPDATE platform_theme_jobs SET status='failed',stage='needs_review',error_code=?,updated_at=? WHERE id=?",[code,Date.now(),job.id]);
   await query(cf,'INSERT INTO platform_audit(id,actor,action,store_id,details_json,created_at) VALUES(?,?,?,?,?,?)',[crypto.randomUUID(),job.requested_by,'theme.change_failed',job.store_id,JSON.stringify({jobId:job.id,code}),Date.now()]);
   console.log(JSON.stringify({themeJob:job.id,store:job.store_id,status:'failed',code}));
  }
 }
}
