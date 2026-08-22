"use client";
import {useParams} from "next/navigation";
import StoreHeader from "../../components/StoreHeader";
const pages:Record<string,{title:string;items:string[]}>={
 shipping:{title:"التوصيل والدفع",items:["التوصيل للضفة الغربية 20 شيكل.","التوصيل للقدس 30 شيكل.","التوصيل للداخل 70 شيكل.","الدفع متاح عند الاستلام أو إلكترونياً، ويشمل المبلغ قيمة الطلب والتوصيل.","قد تختلف تكلفة الطرد الكبير حسب الحجم. يتم اعتماد التوصيل الطبيعي أولاً، ثم يتواصل فريق المتجر مع الزبون عند الحاجة لتعديل السعر."]},
 returns:{title:"الاستبدال والترجيع",items:["يتم فحص طلب الاستبدال أو الترجيع حسب حالة الصنف وسبب الطلب.","يجب الاحتفاظ بالصنف وتغليفه بحالته الأصلية لحين مراجعة الطلب.","أي تكاليف إضافية أو مبالغ مستردة يتم توضيحها للزبون قبل تنفيذ الإجراء."]},
 terms:{title:"سياسات المتجر",items:["تظهر الأسعار والمخزون حسب البيانات المسجلة في المتجر.","يتم تأكيد الطلب ووسيلة الدفع وعنوان التوصيل قبل التجهيز.","بيانات الزبون تستخدم لتجهيز الطلب والتواصل وخدمة ما بعد البيع."]},
 contact:{title:"تواصل معنا",items:["تواصل معنا عبر واتساب للاستفسار عن المنتجات والألوان والمخزون والطلبات.","يمكن ربط أرقام وروابط التواصل الفعلية من إعدادات لوحة التحكم."]}
};
export default function Policy(){const params=useParams<{slug:string}>();const page=pages[params.slug]||pages.terms;return <main><StoreHeader backLabel="العودة للمتجر"/><section className="policyPage"><small>خدمة العملاء</small><h1>{page.title}</h1>{page.items.map((x,i)=><div className="policyItem" key={i}><b>{String(i+1).padStart(2,"0")}</b><p>{x}</p></div>)}</section></main>}
