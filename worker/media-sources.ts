interface SourceBucket{get(key:string):Promise<{body:ReadableStream}|null>}
export async function mediaSources(bucket:SourceBucket):Promise<Map<string,string[]>>{
 const object=await bucket.get('settings/media-sources.json');
 if(!object)return new Map();
 const rows=await new Response(object.body).json() as unknown;
 if(!Array.isArray(rows))throw new Error('Invalid store media source manifest');
 return new Map(rows.filter((row):row is [string,string[]]=>Array.isArray(row)&&row.length===2&&typeof row[0]==='string'&&Array.isArray(row[1])).map(([key,urls])=>[key,urls.filter(url=>{try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/i.test(u.hostname)}catch{return false}})]));
}
