export type JobRecord=Record<string,unknown>;
export function groupProvisioningJobs(jobs:JobRecord[]){
 const groups=new Map<string,{storeId:string;latest:JobRecord;previous:JobRecord[]}>();
 for(const job of [...jobs].sort((a,b)=>Number(b.created_at)-Number(a.created_at))){
  const storeId=String(job.store_id),group=groups.get(storeId);
  if(group)group.previous.push(job);else groups.set(storeId,{storeId,latest:job,previous:[]});
 }
 return [...groups.values()];
}
