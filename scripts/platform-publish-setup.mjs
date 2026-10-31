import{client,SETTINGS,PUBLISHING,wrangler,safeError,ReleaseFailure}from'./platform-publish-common.mjs';
const cf=client(),mode=process.argv[2];let setupStage='start';
async function inspect(){
 const response=await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify',{headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN}}),data=await response.json();
 console.log(JSON.stringify({tokenId:data.result?.id,tokenStatus:data.result?.status}));
 try{await cf.call('/builds/tokens');console.log('workers_builds_accessible')}catch(e){console.log(JSON.stringify({workersBuildsAccessible:false,code:safeError(e)}))}
}
async function setup(){
 // Operator performs this only after authorizing Workers Builds Configuration Edit.
 const scripts=await cf.call('/workers/scripts'),source=scripts.find(s=>s.id==='manar-store');
 setupStage='read_source_build_settings';
 const existing=await cf.call('/builds/workers/'+source.tag);
 const production=existing.production_settings;if(!production?.build_token_uuid)throw new ReleaseFailure('build_token_requires_review');
 setupStage='create_runner';let runner=scripts.find(s=>s.id===PUBLISHING.runnerWorker);
 if(!runner){wrangler(['deploy','--config','wrangler.platform-release-runner.jsonc']);runner=(await cf.call('/workers/scripts')).find(s=>s.id===PUBLISHING.runnerWorker)}
 if(!runner?.tag)throw new ReleaseFailure('runner_not_created');
 setupStage='connect_runner_build';
 const connection=await cf.call('/builds/repos/connections','PUT',{provider_type:'github',provider_account_id:'319731827',provider_account_name:'mahmoudalkaraki96-cloud',repo_id:'1342530801',repo_name:'manar-store'});
 let triggerList;try{triggerList=await cf.call('/builds/workers/'+runner.tag+'/triggers')}catch(e){if(e.status!==404)throw e;triggerList=[]}
 const runnerTriggers=Array.isArray(triggerList)?triggerList:triggerList.triggers||[];
 let trigger=runnerTriggers.find(t=>t.trigger_name==='platform-owner-publish');
 if(!trigger)trigger=await cf.call('/builds/triggers','POST',{external_script_id:runner.tag,repo_connection_uuid:connection.repo_connection_uuid,trigger_name:'platform-owner-publish',branch_includes:[PUBLISHING.runnerBranch],branch_excludes:[],path_includes:['*'],path_excludes:[],root_directory:'/',build_command:'npm ci --ignore-scripts --no-audit --no-fund',deploy_command:'node --experimental-strip-types scripts/platform-publish-engine.mjs && npx wrangler deploy --config wrangler.platform-release-runner.jsonc',build_token_uuid:production.build_token_uuid,build_caching_enabled:true});
 setupStage='store_build_environment';
 await cf.call('/builds/triggers/'+trigger.trigger_uuid+'/environment_variables','PATCH',{PLATFORM_DEPLOY_TOKEN:{is_secret:true,value:process.env.CLOUDFLARE_API_TOKEN},NODE_VERSION:{is_secret:false,value:'22'}});
 setupStage='create_deploy_hook';const hooks=await cf.call('/builds/workers/'+PUBLISHING.runnerWorker+'/deploy_hooks');
 const list=Array.isArray(hooks)?hooks:hooks.deploy_hooks||[];
 let hook=list.find(h=>h.deploy_hook_name==='platform-owner-publish'&&h.branch===PUBLISHING.runnerBranch);
 if(!hook)hook=await cf.call('/builds/workers/'+PUBLISHING.runnerWorker+'/deploy_hooks','POST',{branch:PUBLISHING.runnerBranch,deploy_hook_name:'platform-owner-publish'});
 if(!/^[a-f0-9-]{36}$/.test(hook.deploy_hook_uuid||''))throw new ReleaseFailure('invalid_hook_response');
 const url='https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/'+hook.deploy_hook_uuid;
 setupStage='store_limited_hook_secret';await cf.call('/workers/scripts/'+SETTINGS.workerName+'/secrets','PUT',{name:PUBLISHING.hookSecretName,type:'secret_text',text:url});
 console.log(JSON.stringify({runner:PUBLISHING.runnerWorker,configured:true,hookSecretStored:true}));
}
(mode==='inspect'?inspect():mode==='setup'?setup():Promise.reject(new ReleaseFailure('unknown_setup_operation'))).catch(e=>{console.error(JSON.stringify({code:safeError(e),status:e.status||null,stage:setupStage,...(setupStage==='connect_runner_build'?{apiErrors:e.apiErrors}:{} )}));process.exitCode=1});
