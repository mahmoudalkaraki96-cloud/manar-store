export type WhatsAppCountry="PS"|"IL";
export function orderWhatsAppUrl(phone:string,country:WhatsAppCountry):string|null{
 let number=phone.trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[\s()+.\-\u200e\u200f]/g,"");
 if(!/^\d+$/.test(number))return null;
 if(/^(00970|00972)/.test(number))number=number.slice(5);
 else if(/^(970|972)/.test(number))number=number.slice(3);
 else if(number.startsWith("00"))return null;
 number=number.replace(/^0/,"");
 if(!/^[1-9]\d{7,8}$/.test(number))return null;
 return "https://wa.me/"+(country==="PS"?"970":"972")+number;
}
