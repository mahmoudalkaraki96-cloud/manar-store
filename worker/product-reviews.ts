import type {SecurityDb} from "./admin-security";
export class ReviewError extends Error{constructor(message:string,public status=400){super(message)}}
export async function reviewSchema(db:SecurityDb){
 await db.prepare("CREATE TABLE IF NOT EXISTS product_reviews(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,account_id INTEGER NOT NULL,rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),body TEXT NOT NULL,photos_json TEXT NOT NULL DEFAULT '[]',status TEXT NOT NULL DEFAULT 'pending',created_at INTEGER NOT NULL,UNIQUE(product_id,account_id))").run();
 await db.prepare("CREATE INDEX IF NOT EXISTS product_reviews_status ON product_reviews(status,product_id,created_at)").run();
}
export async function canReview(db:SecurityDb,accountId:number,productId:number){
 return Boolean(await db.prepare("SELECT o.id FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE o.customer_account_id=? AND oi.product_id=? AND o.deleted_at IS NULL AND o.status IN ('delivered','completed') LIMIT 1").bind(accountId,productId).first());
}
export function reviewInput(rating:unknown,body:unknown){
 const score=Number(rating),text=String(body||"").trim();
 if(!Number.isInteger(score)||score<1||score>5||text.length<3||text.length>2000)throw new ReviewError("اختر تقييمًا من 1 إلى 5 واكتب مراجعة من 3 إلى 2000 حرف");
 return {rating:score,body:text};
}
export function reviewImage(bytes:Uint8Array){
 if(bytes.length>1500000||bytes.length<12)throw new ReviewError("كل صورة يجب أن تكون أصغر من 1.5MB");
 const a=Array.from(bytes.slice(0,12)),ascii=(start:number,end:number)=>String.fromCharCode(...a.slice(start,end));
 if(a[0]===255&&a[1]===216&&a[2]===255)return {type:"image/jpeg",ext:"jpg"};
 if(a.slice(0,8).join(",")==="137,80,78,71,13,10,26,10")return {type:"image/png",ext:"png"};
 if(ascii(0,4)==="RIFF"&&ascii(8,12)==="WEBP")return {type:"image/webp",ext:"webp"};
 throw new ReviewError("ارفع صورة JPG أو PNG أو WebP");
}
export async function publicReviews(db:SecurityDb,productId:number){
 const rows=await db.prepare("SELECT id,rating,body,photos_json,created_at FROM product_reviews WHERE product_id=? AND status='approved' ORDER BY created_at DESC LIMIT 50").bind(productId).all<{id:number;rating:number;body:string;photos_json:string;created_at:number}>();
 return rows.results.map(row=>({id:row.id,rating:row.rating,body:row.body,photos:JSON.parse(row.photos_json) as string[],createdAt:row.created_at}));
}
export async function moderateReview(db:SecurityDb,id:number,status:unknown){
 if(!["approved","rejected"].includes(String(status)))throw new ReviewError("حالة غير صحيحة");
 const review=await db.prepare("SELECT product_id FROM product_reviews WHERE id=?").bind(id).first<{product_id:number}>();
 if(!review)throw new ReviewError("المراجعة غير موجودة",404);
 await db.batch([db.prepare("UPDATE product_reviews SET status=? WHERE id=?").bind(status,id),db.prepare("UPDATE products SET rating_count=(SELECT COUNT(*) FROM product_reviews WHERE product_id=? AND status='approved'),rating_average_x100=COALESCE((SELECT ROUND(AVG(rating)*100) FROM product_reviews WHERE product_id=? AND status='approved'),0) WHERE id=?").bind(review.product_id,review.product_id,review.product_id)]);
}

export async function boundedReviewForm(request:Request){const reader=request.body?.getReader();if(!reader)throw new ReviewError("بيانات المراجعة مطلوبة");const chunks:Uint8Array[]=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4600000){await reader.cancel();throw new ReviewError("الصور كبيرة جدًا",413)}chunks.push(value)}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}return new Response(bytes,{headers:{"content-type":request.headers.get("content-type")||""}}).formData()}
