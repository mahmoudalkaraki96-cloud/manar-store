import {emptyProfile,normalizeStoreProfile,type StoreProfile} from '../shared/store-profile';
interface ProfileDB{prepare(sql:string):{bind(...values:unknown[]):{run():Promise<unknown>};first<T>():Promise<T|null>}}
export async function readStoreProfile(db:ProfileDB):Promise<StoreProfile>{
 try{const row=await db.prepare('SELECT settings_json FROM store_profile WHERE id=1').first<{settings_json:string}>();return normalizeStoreProfile(row?JSON.parse(row.settings_json):emptyProfile)}catch(error){if(error instanceof Error&&/no such table.*store_profile/i.test(error.message))return {...emptyProfile};throw error}
}
export async function saveStoreProfile(db:ProfileDB,profile:StoreProfile){
 await db.prepare('INSERT INTO store_profile(id,settings_json,updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET settings_json=excluded.settings_json,updated_at=excluded.updated_at').bind(JSON.stringify(profile),Date.now()).run();
}
