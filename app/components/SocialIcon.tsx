import type {StoreSettings} from "../storefront-types";

export type SocialName="whatsapp"|"instagram"|"facebook"|"tiktok";

export function SocialIcon({name}:{name:SocialName}){
 if(name==="whatsapp")return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 3.5A11.7 11.7 0 0 0 12.1 0C5.6 0 .4 5.2.4 11.7c0 2.1.5 4.1 1.6 5.9L0 24l6.6-1.7a11.7 11.7 0 0 0 5.5 1.4c6.5 0 11.8-5.2 11.8-11.7 0-3.1-1.2-6.1-3.4-8.5Zm-8.4 18.2c-1.7 0-3.5-.5-5-1.4l-.4-.2-3.9 1 1-3.8-.2-.4a9.7 9.7 0 1 1 8.5 4.8Zm5.3-7.2c-.3-.1-1.7-.8-2-1-.3-.1-.5-.1-.7.2l-.9 1.1c-.2.2-.4.2-.7.1-1.8-.9-3-1.7-4.2-3.8-.3-.5.3-.5.9-1.7.1-.2 0-.4 0-.6l-.9-2.2c-.2-.5-.5-.4-.7-.4h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.2-1.2 2.9 0 1.7 1.2 3.3 1.4 3.5.1.2 2.4 3.7 5.9 5.2 2.2 1 3 .9 4.1.8.7-.1 1.7-.7 1.9-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4Z"/></svg>;
 if(name==="instagram")return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="5"/><circle cx="12" cy="12" r="4.3"/><circle cx="17.7" cy="6.4" r="1.1" className="socialIconFill"/></svg>;
 if(name==="facebook")return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.2 8.3V6.4c0-.9.6-1.1 1-1.1h2.7V1.1L14.2 1c-4.1 0-5 3.1-5 5v2.3H6.8V13h2.4v10h5V13h3.4l.4-4.7h-3.8Z"/></svg>;
 return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.2 1c.4 2.4 1.8 3.8 4.1 4v4.1c-1.4 0-2.7-.3-4-1.1v7.5a7.5 7.5 0 1 1-6.5-7.4v4.2a3.4 3.4 0 1 0 2.3 3.2V1h4.1Z"/></svg>;
}

export function socialLinks(s:StoreSettings){
 const links:{name:SocialName;label:string;href:string}[]=[];
 if(s.whatsappEnabled&&s.whatsapp)links.push({name:"whatsapp",label:"واتساب",href:`https://wa.me/${s.whatsapp.replace(/\D/g,"")}`});
 if(s.instagramEnabled&&s.instagramUrl)links.push({name:"instagram",label:"إنستغرام",href:s.instagramUrl});
 if(s.facebookEnabled&&s.facebookUrl)links.push({name:"facebook",label:"فيسبوك",href:s.facebookUrl});
 if(s.tiktokEnabled&&s.tiktokUrl)links.push({name:"tiktok",label:"تيك توك",href:s.tiktokUrl});
 return links;
}

export function SocialPills({links,className}:{links:ReturnType<typeof socialLinks>;className:string}){
 return <div className={className}>{links.map(link=><a key={link.name} className={`socialPill socialPill-${link.name}`} href={link.href} target="_blank" rel="noopener noreferrer"><SocialIcon name={link.name}/><span>{link.label}</span></a>)}</div>;
}
