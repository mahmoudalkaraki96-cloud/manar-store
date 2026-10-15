interface Statement{bind(...values:unknown[]):Statement;run():Promise<unknown>;first<T>():Promise<T|null>;all<T>():Promise<{results:T[]}>}
interface Database{prepare(sql:string):Statement}
export const ONLINE_MS=5*60000;
export const ACTIVITY_RETENTION_MS=30*86400000;
export function deviceDescription(userAgent:string){
 const ua=userAgent.slice(0,500);
 const deviceType=/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)?'tablet':/Mobile|iPhone|Android/i.test(ua)?'mobile':ua?'desktop':'unknown';
 const browser=/Edg\//.test(ua)?'Edge':/Firefox|FxiOS/.test(ua)?'Firefox':/Chrome|CriOS/.test(ua)?'Chrome':/Safari/.test(ua)?'Safari':'متصفح آخر';
 return {deviceType,browser};
}
export function approximateLocation(request:Request){
 const cf=(request as Request&{cf?:{country?:unknown;city?:unknown}}).cf;
 const country=typeof cf?.country==='string'&&/^[A-Z]{2}$/.test(cf.country)&&!['XX','T1'].includes(cf.country)?cf.country:'';
 const city=country&&typeof cf?.city==='string'?cf.city.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,100):'';
 return {country,city};
}
export async function anonymousDeviceKey(id:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id));return Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,12);}
export async function recordBrowserActivity(request:Request,db:Database,id:string,now=Date.now()){
 const {deviceType,browser}=deviceDescription(request.headers.get('user-agent')||''),{country,city}=approximateLocation(request);
 await db.prepare('INSERT INTO store_browser_activity(cart_id,device_type,browser,country,city,first_seen_at,last_seen_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(cart_id) DO UPDATE SET device_type=excluded.device_type,browser=excluded.browser,country=excluded.country,city=excluded.city,last_seen_at=excluded.last_seen_at').bind(id,deviceType,browser,country,city,now,now).run();
}
export async function purgeBrowserActivity(db:Database,now=Date.now()){await db.prepare('DELETE FROM store_browser_activity WHERE last_seen_at<?').bind(now-ACTIVITY_RETENTION_MS).run();}
export async function readBrowserActivity(db:Database,now=Date.now()){
 const cutoff=now-ONLINE_MS;
 const [total,locations]=await Promise.all([
  db.prepare('SELECT COUNT(*) AS online FROM store_browser_activity WHERE last_seen_at>=?').bind(cutoff).first<{online:number}>(),
  db.prepare('SELECT country,city,COUNT(*) AS devices FROM store_browser_activity WHERE last_seen_at>=? GROUP BY country,city ORDER BY devices DESC,country,city LIMIT 50').bind(cutoff).all<{country:string;city:string;devices:number}>()
 ]);
 return {onlineDevices:Number(total?.online||0),windowMinutes:5,asOf:now,locations:locations.results.map(row=>({country:row.country,city:row.city,devices:Number(row.devices)}))};
}
