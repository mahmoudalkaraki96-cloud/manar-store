import {productThumbnail} from '../image-utils';

export type PreparationOrder={
 orderNumber:number;createdAt:number;customerName:string;phone:string;city:string;address:string;notes:string;
 items:{itemNumber?:number;productName:string;variantLabel?:string|null;quantity:number;imageUrl?:string|null;customizations?:Record<string,string>}[];
};

/** This sheet deliberately accepts and renders fulfillment fields only. */
export default function OrderPreparationSheet({order,storeName="المتجر"}:{order:PreparationOrder;storeName?:string}){
 const quantity=order.items.reduce((sum,item)=>sum+item.quantity,0);
 return <article className="orderPreparationSheet" data-order-preparation dir="rtl">
  <header className="orderPrintHead"><div><h1>تجهيز طلب #{order.orderNumber}</h1><p>{new Date(order.createdAt).toLocaleString('en-GB',{timeZone:'Asia/Hebron'})}</p></div><div><b>{storeName}</b><small>نسخة تجهيز بدون أسعار</small></div></header>
  <div className="orderAddress"><div><small>اسم الزبون</small><b>{order.customerName}</b></div><div><small>الهاتف</small><b dir="ltr">{order.phone}</b></div><div><small>المدينة</small><b>{order.city}</b></div><div><small>العنوان</small><b>{order.address}</b></div></div>
  <table className="orderPrintTable orderPreparationTable"><thead><tr><th>#</th><th>الصورة</th><th>رقم الصنف</th><th>الصنف والمتغير والتخصيص</th><th>الكمية</th><th>تم التجهيز</th></tr></thead><tbody>{order.items.map((item,index)=><tr key={index}><td>{index+1}</td><td>{item.imageUrl?<img className="orderItemImage" src={productThumbnail(item.imageUrl,240)} alt=""/>:'—'}</td><td>{item.itemNumber?'#'+item.itemNumber:'يدوي'}</td><td><b>{item.productName}</b>{item.variantLabel&&<small>{item.variantLabel}</small>}{Object.entries(item.customizations||{}).map(([label,value])=><small className="printedCustomization" key={label}><b>{label}:</b> {value}</small>)}</td><td className="preparationQuantity">{item.quantity}</td><td className="checkCell">□</td></tr>)}</tbody></table>
  <p className="preparationCount">عدد الأصناف: <b>{order.items.length}</b> · مجموع القطع: <b>{quantity}</b></p>
  {order.notes&&<div className="printedNotes"><small>ملاحظات الطلب</small><p>{order.notes}</p></div>}
  <footer className="orderPrintFooter"><span>تم التجهيز: __________</span><span>تم التدقيق: __________</span><span>التاريخ: __________</span></footer>
 </article>
}
