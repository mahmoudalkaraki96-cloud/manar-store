import { importedDistributionProducts } from "../worker/import-cat40.generated";
import importedAllProducts from "../worker/import-all-products.generated.json";
import importedJabariProducts from "../worker/import-jabari-products.generated.json";
import importedJabariVariants from "../worker/import-jabari-variants.generated.json";
import importedDofeshVariants from "../worker/import-dofesh-variants.generated.json";
const importedPearlProducts = [
  { sourceId: 598, name: "لولو نص حبة 8 مل", price: 30, image: "b8a71253-89e9-44f0-bab2-48c597ea4d3c", folder: "09-2025", extension: "jpeg" },
  { sourceId: 301, name: "سترس محجر 9 متر اصلي", price: 20, image: "IMG_2446", folder: "04-2026", extension: "png" },
  { sourceId: 300, name: "رول لولو نص حبة 60 متر لون لولي", price: 30, image: "bbeae8e9-8a91-48ad-9f06-8f6ddcc4c110", folder: "08-2025", extension: "jpeg" },
  { sourceId: 299, name: "رول لولو نص حبة 60 متر أزرق", price: 30, image: "48227ac6-90dd-4278-9f63-088c32a8229e", folder: "08-2025", extension: "jpeg" },
  { sourceId: 298, name: "رول لولو نص حبة 60 متر زهري", price: 30, image: "a6889f08-71cf-4bff-961a-a881e4f82e84", folder: "08-2025", extension: "jpeg" },
  { sourceId: 297, name: "رول لولو 60 متر أبيض", price: 40, image: "e914d712-ad9d-4099-82b9-0b7201f85225", folder: "08-2025", extension: "jpeg" },
  { sourceId: 296, name: "رول لولو 60متر ذهبي", price: 40, image: "c8727f4b-98d0-4a4b-84d9-12ffc7400ea4", folder: "08-2025", extension: "jpeg" },
  { sourceId: 295, name: "رول لولو 60متر لون لولي", price: 40, image: "4fa0b281-313e-43e6-b02b-72cad1969cb4", folder: "08-2025", extension: "jpeg" },
] as const;
const importedResinProducts = [
  { sourceId: 948, name: "ريزون علاقة زهري محجر", price: 3, image: "upload/02-2026/product/IMG_9524", extension: "jpeg" },
  { sourceId: 936, name: "ريزون حجم كبير سادى مقاس ٢٨ سم مع قاعدة ذهبية", price: 40, image: "upload/02-2026/product/IMG_9240", extension: "jpeg" },
  { sourceId: 935, name: "ريزون حجم كبير مع قاعدة ذهبية مقاس ٢٨ سم محجر من الاطراف", price: 40, image: "upload/02-2026/product/IMG_9237", extension: "jpeg" },
  { sourceId: 674, name: "ريزون محجر مع علاقة", price: 3, image: "upload/11-2025/product/dbd774df-3949-420c-bcb7-8d1487b23b5d", extension: "jpeg" },
  { sourceId: 233, name: "ريزون تعليقة أزرق محجر 6سم", price: 2, image: "upload/08-2025/product/e1e69485-936f-4445-9267-9beb8c360dd6", extension: "jpeg" },
  { sourceId: 232, name: "ريزون مذهب سادى بدون حجر7سم", price: 2, image: "upload/11-2025/product/15f99f4d-22fe-4168-a35a-ae6c98deda71", extension: "jpeg" },
  { sourceId: 231, name: "ريزون محجر مدور زهري 7سم", price: 2, image: "upload/11-2025/product/0d128ee4-63bb-4aaa-a58b-d40231069083", extension: "jpeg" },
  { sourceId: 230, name: "ريزن مدور محجر فضي 7سم", price: 2, image: "upload/08-2025/product/9991e99e-e308-45c8-b333-24b4269a554e", extension: "jpeg" },
  { sourceId: 229, name: "ريزون محجر مدور ذهبي", price: 2, image: "upload/08-2025/product/d826b23e-190a-4e34-a56c-6f6538d5ce01 (1)", extension: "jpeg" },
  { sourceId: 228, name: "ريزون محجر ذهبي", price: 2, image: "upload/08-2025/product/1ae992a5-127d-43f1-be3c-a8060b90b96f", extension: "jpeg" },
  { sourceId: 227, name: "ريزون محجر ذهبي", price: 2, image: "upload/11-2025/product/8f627bbf-7d94-4cf0-aa72-718d4e713ff0", extension: "jpeg" },
  { sourceId: 226, name: "ريزون أزرق محجر", price: 3, image: "upload/08-2025/product/707f3fc0-e5ea-405a-8eb8-d2ec74e1dd1e", extension: "jpeg", variants: ["مدور", "مشرف"] },
  { sourceId: 225, name: "ريزون محجر زهري 7سم", price: 2, image: "upload/08-2025/product/386a726e-2f5c-49b7-9663-9307be9d9f48", extension: "jpeg" },
  { sourceId: 224, name: "ريزون زهري محجر 7 سم", price: 2, image: "upload/08-2025/product/e5dd22cf-0ec6-4a88-88ac-2ccfc23689b7", extension: "jpeg" },
] as const;
export const importedMediaSources = new Map<string, readonly string[]>(importedPearlProducts.map((product) => {
  const base = `https://dofesh.ps/upload/${product.folder}/product/${product.image}`;
  return [`imports/dofesh-${product.sourceId}.${product.extension}`, [`${base}-IDX.${product.extension}`, `${base}-450px.${product.extension}`]] as const;
}).concat(importedResinProducts.map((product) => {
  const base = `https://dofesh.ps/${product.image}`;
  return [`imports/dofesh-${product.sourceId}.${product.extension}`, [`${base}-IDX.${product.extension}`, `${base}-450px.${product.extension}`]] as const;
})).concat(importedDistributionProducts.map((product) => {
  const pathname = new URL(product.image).pathname;
  const extension = pathname.split(".").pop()?.toLowerCase() || "jpeg";
  return [`imports/dofesh-${product.id}.${extension}`, [product.image, product.image.replace("-IDX.", "-450px.")]] as const;
})).concat(importedAllProducts.map((product) => {
  const extension = new URL(product.image).pathname.split(".").pop()?.toLowerCase() || "jpeg";
  return [`imports/dofesh-${product.id}.${extension}`, [product.image, product.image.replace("-450px.", "-IDX.")]] as const;
})).concat(importedJabariProducts.map((product) => {
  const extension = new URL(product.imageUrl).pathname.split(".").pop()?.toLowerCase() || "jpeg";
  return [`imports/jabari-${product.sourceId}.${extension}`, [product.imageUrl]] as const;
})).concat(([...importedJabariVariants.map(record => ({source:"jabari",record})),...importedDofeshVariants.map(record => ({source:"dofesh",record}))]).flatMap(({source,record}) => Object.values(record.groups || {}).flat().map((variant, index) => {
  if (!variant.imageUrl) return null;
  const absolute = new URL(variant.imageUrl, source === "jabari" ? "https://jabaristore.com/" : "https://dofesh.ps/").toString();
  const extension = new URL(absolute).pathname.split(".").pop()?.toLowerCase() || "jpeg";
  return [`imports/${source}-${record.sourceId}-variant-${index}.${extension}`, [absolute]] as const;
}).filter((item): item is readonly [string, readonly string[]] => Boolean(item)))));
