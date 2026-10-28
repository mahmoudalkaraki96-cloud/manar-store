import type {FloatingPosition} from './floating-actions';
export type AdminNotificationPreference={hidden:boolean;position?:FloatingPosition};
export const adminNotificationKey='manar_admin_notification_button_v1',adminNotificationEvent='manar:admin-notification-button';
export function parseAdminNotificationPreference(raw:string|null):AdminNotificationPreference{
 const value:AdminNotificationPreference={hidden:false};try{const parsed=JSON.parse(raw||'null');value.hidden=parsed?.hidden===true;const p=parsed?.position;if(typeof p?.x==='number'&&Number.isFinite(p.x)&&typeof p?.y==='number'&&Number.isFinite(p.y))value.position={x:Math.min(1,Math.max(0,p.x)),y:Math.min(1,Math.max(0,p.y))}}catch{}return value;
}
let memory:AdminNotificationPreference={hidden:false},memoryOnly=false;
export function readAdminNotificationPreference(){if(memoryOnly)return memory;try{return parseAdminNotificationPreference(localStorage.getItem(adminNotificationKey))}catch{return memory}}
export function saveAdminNotificationPreference(next:AdminNotificationPreference){memory=next;try{localStorage.setItem(adminNotificationKey,JSON.stringify(next))}catch{memoryOnly=true}window.dispatchEvent(new Event(adminNotificationEvent))}
