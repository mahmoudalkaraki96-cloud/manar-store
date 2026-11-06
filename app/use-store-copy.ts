"use client";

import {useEffect,useState} from "react";
import {storeLanguage,type StoreLanguage} from "./store-language";

const dictionary: Record<string,{en:string;he:string}> = {
  "الرئيسية": {
    "en": "Home",
    "he": "בית"
  },
  "الصفحة الرئيسية": {
    "en": "Home",
    "he": "בית"
  },
  "الأقسام الفرعية": {
    "en": "Subcategories",
    "he": "קטגוריות משנה"
  },
  "أقسام": {
    "en": "Categories",
    "he": "קטגוריות"
  },
  "ابحث بالاسم أو رقم الصنف": {
    "en": "Search by name or item number",
    "he": "חיפוש לפי שם או מספר פריט"
  },
  "كل الأسعار": {
    "en": "All prices",
    "he": "כל המחירים"
  },
  "كل حالات التوفر": {
    "en": "All availability",
    "he": "כל מצבי המלאי"
  },
  "متوفر": {
    "en": "In stock",
    "he": "במלאי"
  },
  "غير متوفر": {
    "en": "Out of stock",
    "he": "לא במלאי"
  },
  "الأكثر طلباً": {
    "en": "Best sellers",
    "he": "הנמכרים ביותר"
  },
  "الأحدث": {
    "en": "Newest",
    "he": "החדשים ביותר"
  },
  "الأعلى تقييماً": {
    "en": "Top rated",
    "he": "המדורגים ביותר"
  },
  "السعر": {
    "en": "Price",
    "he": "מחיר"
  },
  "الأقل أولاً": {
    "en": "Lowest first",
    "he": "מהנמוך לגבוה"
  },
  "الأعلى أولاً": {
    "en": "Highest first",
    "he": "מהגבוה לנמוך"
  },
  "الأقل أولًا": {
    "en": "Lowest first",
    "he": "מהנמוך לגבוה"
  },
  "الأعلى أولًا": {
    "en": "Highest first",
    "he": "מהגבוה לנמוך"
  },
  "منتجات القسم": {
    "en": "Category products",
    "he": "מוצרים בקטגוריה"
  },
  "نتيجة": {
    "en": "results",
    "he": "תוצאות"
  },
  "لا توجد منتجات مطابقة": {
    "en": "No matching products",
    "he": "אין מוצרים תואמים"
  },
  "القسم غير موجود": {
    "en": "Category not found",
    "he": "הקטגוריה לא נמצאה"
  },
  "العودة للرئيسية": {
    "en": "Back to home",
    "he": "חזרה לדף הבית"
  },
  "العروض": {
    "en": "Offers",
    "he": "מבצעים"
  },
  "مضاف حديثاً": {
    "en": "New arrivals",
    "he": "מוצרים חדשים"
  },
  "منتجات مميزة": {
    "en": "Featured products",
    "he": "מוצרים נבחרים"
  },
  "مختارات من القسم": {
    "en": "Category picks",
    "he": "מבחר מהקטגוריה"
  },
  "مختارات مميزة لك": {
    "en": "Selected for you",
    "he": "נבחר במיוחד עבורך"
  },
  "عرض الكل ←": {
    "en": "View all",
    "he": "הצגת הכול"
  },
  "مشاهدة الكل ←": {
    "en": "View all",
    "he": "הצגת הכול"
  },
  "جاري تحميل المنتجات": {
    "en": "Loading products",
    "he": "טוען מוצרים"
  },
  "المتجر قيد التجهيز": {
    "en": "The store is being prepared",
    "he": "החנות בהכנה"
  },
  "ابحث في المنتجات": {
    "en": "Search products",
    "he": "חיפוש מוצרים"
  },
  "اكتب اسم المنتج أو رقمه أو القسم": {
    "en": "Enter a product name, item number or category",
    "he": "הקלידו שם מוצר, מספר פריט או קטגוריה"
  },
  "ابحث": {
    "en": "Search",
    "he": "חיפוש"
  },
  "نتائج البحث": {
    "en": "Search results",
    "he": "תוצאות חיפוש"
  },
  "جاري البحث": {
    "en": "Searching",
    "he": "מחפש"
  },
  "منتج": {
    "en": "products",
    "he": "מוצרים"
  },
  "اكتب كلمة للبحث": {
    "en": "Enter a search term",
    "he": "הקלידו מילת חיפוש"
  },
  "الأقسام المطابقة": {
    "en": "Matching categories",
    "he": "קטגוריות תואמות"
  },
  "قسم": {
    "en": "categories",
    "he": "קטגוריות"
  },
  "ترتيب نتائج البحث": {
    "en": "Sort search results",
    "he": "מיון תוצאות חיפוש"
  },
  "الأكثر ملاءمة": {
    "en": "Most relevant",
    "he": "הכי רלוונטי"
  },
  "عرض المزيد من النتائج": {
    "en": "Show more results",
    "he": "הצגת תוצאות נוספות"
  },
  "ما لقينا منتجات مطابقة": {
    "en": "No matching products",
    "he": "לא נמצאו מוצרים תואמים"
  },
  "جاري تحميل الصنف": {
    "en": "Loading product",
    "he": "טוען מוצר"
  },
  "الصنف غير موجود": {
    "en": "Product not found",
    "he": "המוצר לא נמצא"
  },
  "العودة للمتجر": {
    "en": "Back to store",
    "he": "חזרה לחנות"
  },
  "الصورة التالية": {
    "en": "Next image",
    "he": "התמונה הבאה"
  },
  "الصورة السابقة": {
    "en": "Previous image",
    "he": "התמונה הקודמת"
  },
  "أدخل الكمية": {
    "en": "Enter quantity",
    "he": "הזינו כמות"
  },
  "تمت إضافة المنتج إلى السلة": {
    "en": "Item added to cart",
    "he": "המוצר נוסף לסל"
  },
  "اطلب عبر واتساب": {
    "en": "Order on WhatsApp",
    "he": "הזמנה בוואטסאפ"
  },
  "مشاركة المنتج": {
    "en": "Share product",
    "he": "שיתוף מוצר"
  },
  "نسخ رابط المنتج": {
    "en": "Copy product link",
    "he": "העתקת קישור למוצר"
  },
  "نسخ الرابط": {
    "en": "Copy link",
    "he": "העתקת קישור"
  },
  "مواصفات المنتج": {
    "en": "Specifications",
    "he": "מפרט המוצר"
  },
  "تفاصيل المنتج": {
    "en": "Product details",
    "he": "פרטי המוצר"
  },
  "فيديو المنتج": {
    "en": "Product video",
    "he": "סרטון המוצר"
  },
  "شاهد المنتج": {
    "en": "See the product",
    "he": "צפייה במוצר"
  },
  "قد تعجبك أيضاً": {
    "en": "You may also like",
    "he": "אולי יעניין אותך גם"
  },
  "منتجات من نفس القسم": {
    "en": "Related products",
    "he": "מוצרים מאותה קטגוריה"
  },
  "خدمة العملاء": {
    "en": "Customer service",
    "he": "שירות לקוחות"
  },
  "روابط خدمة العملاء": {
    "en": "Customer service links",
    "he": "קישורי שירות לקוחות"
  },
  "الاستبدال وفحص المنتج": {
    "en": "Exchanges and product inspection",
    "he": "החלפה ובדיקת המוצר"
  },
  "الخصوصية وملفات الارتباط": {
    "en": "Privacy and cookies",
    "he": "פרטיות וקובצי Cookie"
  },
  "تواصل معنا": {
    "en": "Contact us",
    "he": "צרו קשר"
  },
  "الخصوصية": {
    "en": "Privacy",
    "he": "פרטיות"
  },
  "تخصيص المنتج": {
    "en": "Customize product",
    "he": "התאמה אישית של המוצר"
  },
  "إغلاق التخصيص": {
    "en": "Close customization",
    "he": "סגירת התאמה אישית"
  },
  "إضافة للسلة": {
    "en": "Add to cart",
    "he": "הוספה לסל"
  },
  "التقدم نحو التوصيل المجاني": {
    "en": "Free delivery progress",
    "he": "התקדמות למשלוח חינם"
  },
  "طلبك مؤهل للتوصيل المجاني": {
    "en": "Your order qualifies for free delivery",
    "he": "ההזמנה זכאית למשלוח חינם"
  },
  "إتمام الطلب": {
    "en": "Checkout",
    "he": "השלמת הזמנה"
  },
  "إتمام الشراء": {
    "en": "Checkout",
    "he": "השלמת רכישה"
  },
  "بيانات التوصيل": {
    "en": "Delivery details",
    "he": "פרטי משלוח"
  },
  "مراجعة المنتجات وتعديل السلة": {
    "en": "Review items and edit cart",
    "he": "בדיקת פריטים ועריכת הסל"
  },
  "منتجات الطلب": {
    "en": "Order items",
    "he": "פריטי ההזמנה"
  },
  "عنوان الشحن المحفوظ": {
    "en": "Saved delivery address",
    "he": "כתובת משלוח שמורה"
  },
  "الافتراضي": {
    "en": "Default",
    "he": "ברירת מחדל"
  },
  "استخدام عنوان آخر": {
    "en": "Use a different address",
    "he": "שימוש בכתובת אחרת"
  },
  "الاسم الكامل": {
    "en": "Full name",
    "he": "שם מלא"
  },
  "رقم الهاتف": {
    "en": "Phone number",
    "he": "מספר טלפון"
  },
  "المدينة": {
    "en": "City",
    "he": "עיר"
  },
  "المدينة أو البلدة": {
    "en": "City or town",
    "he": "עיר או יישוב"
  },
  "العنوان بالتفصيل": {
    "en": "Full address",
    "he": "כתובת מלאה"
  },
  "الحي، الشارع، أقرب معلم": {
    "en": "Neighborhood, street, nearest landmark",
    "he": "שכונה, רחוב ונקודת ציון קרובה"
  },
  "منطقة التوصيل": {
    "en": "Delivery area",
    "he": "אזור משלוח"
  },
  "طريقة الدفع": {
    "en": "Payment method",
    "he": "אמצעי תשלום"
  },
  "الدفع عند الاستلام": {
    "en": "Cash on delivery",
    "he": "תשלום בעת המסירה"
  },
  "ملاحظات": {
    "en": "Notes",
    "he": "הערות"
  },
  "المنتجات": {
    "en": "Products",
    "he": "מוצרים"
  },
  "التوصيل": {
    "en": "Delivery",
    "he": "משלוח"
  },
  "الإجمالي": {
    "en": "Total",
    "he": "סך הכול"
  },
  "قرأت وأوافق على": {
    "en": "I have read and agree to",
    "he": "קראתי ואני מסכים לתנאים של"
  },
  "سياسات المتجر": {
    "en": "Store policies",
    "he": "מדיניות החנות"
  },
  "، بما فيها التوصيل والإلغاء والاستبدال": {
    "en": " including delivery, cancellation and exchanges",
    "he": " לרבות משלוח, ביטול והחלפה"
  },
  "جاري تسجيل الطلب": {
    "en": "Submitting order",
    "he": "ההזמנה נשלחת"
  },
  "تأكيد الطلب": {
    "en": "Confirm order",
    "he": "אישור הזמנה"
  },
  "سلة المشتريات": {
    "en": "Shopping cart",
    "he": "סל הקניות"
  },
  "السلة فارغة": {
    "en": "Your cart is empty",
    "he": "סל הקניות ריק"
  },
  "ملاحظات على المنتج": {
    "en": "Product notes",
    "he": "הערות על המוצר"
  },
  "أي ملاحظة خاصة بهذا المنتج": {
    "en": "Notes for this item",
    "he": "הערות לפריט זה"
  },
  "حذف من السلة": {
    "en": "Remove from cart",
    "he": "הסרה מהסל"
  },
  "إجمالي المنتجات": {
    "en": "Items subtotal",
    "he": "סכום ביניים לפריטים"
  },
  "المفضلة": {
    "en": "Favorites",
    "he": "מועדפים"
  },
  "جاري التحميل": {
    "en": "Loading",
    "he": "טוען"
  },
  "لا توجد منتجات في المفضلة": {
    "en": "No favorite products",
    "he": "אין מוצרים במועדפים"
  },
  "إزالة": {
    "en": "Remove",
    "he": "הסרה"
  },
  "المنتج": {
    "en": "Product",
    "he": "מוצר"
  },
  "تم استلام طلبك": {
    "en": "Order received",
    "he": "ההזמנה התקבלה"
  },
  "رقم الطلب": {
    "en": "Order number",
    "he": "מספר הזמנה"
  },
  "متابعة الطلب": {
    "en": "Track order",
    "he": "מעקב אחר הזמנה"
  },
  "تتبع الطلب": {
    "en": "Track order",
    "he": "מעקב אחר הזמנה"
  },
  "نفدت الكمية": {
    "en": "Sold out",
    "he": "אזל מהמלאי"
  },
  "الكمية": {
    "en": "Quantity",
    "he": "כמות"
  },
  "إنقاص الكمية": {
    "en": "Decrease quantity",
    "he": "הפחתת כמות"
  },
  "زيادة الكمية": {
    "en": "Increase quantity",
    "he": "הגדלת כמות"
  },
  "تمت الإضافة": {
    "en": "Added",
    "he": "נוסף לסל"
  },
  "أضف إلى السلة": {
    "en": "Add to cart",
    "he": "הוספה לסל"
  },
  "خيارات متوفرة": {
    "en": "Available options",
    "he": "אפשרויות זמינות"
  },
  "إغلاق": {
    "en": "Close",
    "he": "סגירה"
  },
  "الخيار": {
    "en": "Option",
    "he": "אפשרות"
  },
  "السلة": {
    "en": "Cart",
    "he": "סל"
  },
  "قطعة": {
    "en": "items",
    "he": "פריטים"
  },
  "قيمة المنتجات بدون التوصيل": {
    "en": "Items total before delivery",
    "he": "סכום הפריטים לפני משלוח"
  },
  "فتح سلة المشتريات": {
    "en": "Open shopping cart",
    "he": "פתיחת סל הקניות"
  },
  "ملخص سلة المشتريات": {
    "en": "Cart summary",
    "he": "סיכום סל הקניות"
  },
  "حسابي": {
    "en": "My account",
    "he": "החשבון שלי"
  },
  "تسجيل الدخول": {
    "en": "Sign in",
    "he": "כניסה"
  },
  "البحث عن المنتجات": {
    "en": "Search products",
    "he": "חיפוש מוצרים"
  },
  "تعذر تسجيل الطلب": {
    "en": "Could not submit order",
    "he": "לא ניתן לשלוח את ההזמנה"
  },
  "الاسم الكامل مطلوب": {
    "en": "Full name is required",
    "he": "יש להזין שם מלא"
  },
  "المدينة مطلوبة": {
    "en": "City is required",
    "he": "יש להזין עיר"
  },
  "العنوان بالتفصيل مطلوب": {
    "en": "Full address is required",
    "he": "יש להזין כתובת מלאה"
  }
};

export function useStoreCopy(){
 const [language,setLanguage]=useState<StoreLanguage>("ar");
 useEffect(()=>setLanguage(storeLanguage()),[]);
 return (text:string)=>language==="ar"?text:(dictionary[text]?.[language]??text);
}
