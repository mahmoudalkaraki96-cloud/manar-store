const HOST='tammouni-home.com';
const unique=items=>[...new Set(items.filter(Boolean))];
function media(value){if(!value)return null;const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||!((u.hostname===HOST&&u.pathname.startsWith('/wp-content/uploads/'))||(u.hostname==='cdn.treesal.com'&&u.pathname.startsWith('/altammuni/uploads/'))))throw Error('unverified_media_url');return u.href}
function amount(value){const n=Number(value);if(!Number.isFinite(n)||n<=0||Math.abs(n*100-Math.round(n*100))>0.00001)throw Error('invalid_price');return Math.round(n*100)}
export function normalizeSnapshot(s){
 const url=new URL(s.url);if(url.hostname!==HOST||url.protocol!=='https:'||!/^\/product\/[^/]+\/?$/.test(url.pathname))throw Error('source_url_mismatch');
 if(!/^\d+$/.test(String(s.id))||!s.name)throw Error('source_identity_missing');
 const review=[...(s.review||[])],variants=[];
 if(s.hasVariations&&!Array.isArray(s.variations))throw Error('dynamic_variations_need_review');
 for(const v of s.variations||[]){
  if(!v.variation_id)throw Error('variant_identity_missing');let combos=[[]];
  for(const [key,raw]of Object.entries(v.attributes||{})){
   const option=s.options.find(o=>o.name===key);if(!option)throw Error('unknown_variant_attribute');
   const values=raw?[option.values.find(x=>x.value===raw)]:option.values;if(!values.length||values.some(x=>!x))throw Error('unknown_variant_value');
   combos=combos.flatMap(c=>values.map(x=>[...c,{key,value:x.value,label:option.label,text:x.text}]));
   if(combos.length>100)throw Error('too_many_variant_combinations');
  }
  if(!combos[0]?.length)throw Error('empty_variant_attributes');
  if(Number(v.min_qty||1)>1)review.push('minimum_quantity_'+v.min_qty);
  if(v.is_virtual||v.is_downloadable)review.push('non_physical_product');
  const pictures=unique([v.image?.full_src||v.image?.url||v.image?.src,...(v.extraImages||[])]).map(media);
  for(const c of combos)variants.push({sourceKey:String(v.variation_id)+':'+c.map(a=>a.key+'='+a.value).join('&'),sourceVariationId:String(v.variation_id),name:c.map(a=>a.label+': '+a.text).join(' / '),attributes:c,purchaseAgorot:amount(v.display_price),saleBeforeAgorot:amount(v.display_regular_price),available:v.is_in_stock===true&&v.is_purchasable===true&&v.variation_is_active!==false&&v.variation_is_visible!==false,images:pictures,notes:[v.descriptionText,v.dimensionsText,v.weightText].filter(Boolean).join('\n')});
 }
 if(variants.length>100||new Set(variants.map(v=>v.name)).size!==variants.length)throw Error('ambiguous_or_too_many_variants');
 if(s.hasVariations&&!variants.length)throw Error('missing_variants');
 const available=variants.filter(v=>v.available),images=unique(s.images||[]).map(media),allImages=unique([...images,...variants.flatMap(v=>v.images)]);
 if(Number(s.minimum||1)>1)review.push('minimum_quantity_'+s.minimum);
 return{source:HOST,sourceId:String(s.id),sourceUrl:url.href,name:s.name,categories:s.categories||[],purchaseAgorot:variants.length?(available.length?Math.min(...available.map(v=>v.purchaseAgorot)):null):amount(s.price),saleBeforeAgorot:variants.length?(available.length?Math.min(...available.map(v=>v.saleBeforeAgorot)):null):amount(s.regularPrice),available:variants.length?available.length>0:s.available===true,variants,images,allImages,description:s.description||'',properties:s.properties||[],notes:s.notes||'',customFields:s.customFields||[],videos:unique(s.videos||[]).map(media),minimum:s.minimum||1,review:unique(review),capturedAt:new Date().toISOString()};
}
