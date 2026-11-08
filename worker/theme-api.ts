import {SecurityError,type AdminActor,type SecurityDb} from './admin-security';
import {radiusOptions,themes,validateTheme} from '../shared/store-theme';
import {readStoreProfile,saveStoreProfile} from './store-profile';

const options={themes:Object.entries(themes).map(([id,theme])=>({id,label:theme.label})),radius:Object.entries(radiusOptions).map(([id,option])=>({id,label:option.label}))};

// Store theme, reachable from the store admin by the platform admin only.
export async function themeApi(request:Request,env:{DB:SecurityDb},actor:AdminActor):Promise<Response|null>{
 if(new URL(request.url).pathname!=='/api/admin/theme')return null;
 if(!actor.platformAdmin)throw new SecurityError('هذا الإعداد متاح لمدير المنصة فقط',403);
 if(request.method==='GET')return Response.json({theme:(await readStoreProfile(env.DB)).theme,...options});
 if(request.method!=='PUT')throw new SecurityError('Not Found',404);
 let theme;
 try{theme=validateTheme(await request.json())}catch(error){throw new SecurityError(error instanceof Error&&!(error instanceof SyntaxError)?error.message:'بيانات غير صحيحة',400)}
 const profile=await readStoreProfile(env.DB);
 await saveStoreProfile(env.DB,{...profile,theme});
 return Response.json({ok:true,theme});
}
