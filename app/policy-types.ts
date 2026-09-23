export type StorePolicyKey="receiving"|"shipping"|"cancellation"|"exchange";
export type StorePolicies={version:number;receiving:string;shipping:string;cancellation:string;exchange:string;updatedAt:number};
export const policySections:Array<{key:StorePolicyKey;title:string;icon:string}>=[
 {key:"receiving",title:"استقبال الطلبات",icon:"✓"},
 {key:"shipping",title:"التوصيل",icon:"🚚"},
 {key:"cancellation",title:"إلغاء الطلب",icon:"×"},
 {key:"exchange",title:"الاستبدال وفحص المنتج",icon:"↔"}
];
export async function loadPolicies():Promise<StorePolicies>{const response=await fetch("/api/policies",{cache:"no-store"});if(!response.ok)throw new Error("تعذر تحميل سياسات المتجر");const body=await response.json() as {policies:StorePolicies};return body.policies}
