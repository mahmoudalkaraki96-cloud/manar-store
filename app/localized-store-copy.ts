// Match the original text so an edited policy cannot display a stale translation.
const translations: Record<string, readonly [string, string]> = {
  "يستقبل المتجر الطلبات إلكترونياً على مدار الساعة. تسجيل الطلب لا يعني تأكيده نهائياً؛ يعتمد الطلب بعد مراجعة البيانات وتوفر المنتجات. يحق للمتجر التواصل مع الزبون للتأكيد أو طلب معلومات إضافية، ويمكن تعليق الطلب أو إلغاؤه إذا تعذر التواصل أو كانت البيانات ناقصة. إذا نفد منتج بعد تسجيل الطلب، يتم التواصل لاختيار بديل أو حذف المنتج غير المتوفر.": [
    "The store accepts online orders around the clock. Placing an order does not confirm it. Orders are confirmed after we review the details and check availability. We may contact you to confirm the order or request more information. We may put the order on hold or cancel it if we cannot reach you or if information is missing. If an item sells out after you order, we will contact you to choose a replacement or remove it.",
    "החנות מקבלת הזמנות מקוונות בכל שעות היממה. שליחת הזמנה אינה אישור סופי. ההזמנה תאושר לאחר בדיקת הפרטים וזמינות המוצרים. החנות רשאית ליצור קשר כדי לאשר את ההזמנה או לבקש פרטים נוספים, ולהשהות או לבטל אותה אם אין מענה או אם חסרים פרטים. אם מוצר אזל לאחר ביצוע ההזמנה, ניצור קשר כדי לבחור חלופה או להסיר אותו."
  ],
  "تستغرق مدة التوصيل عادةً من يوم إلى يومين، وقد تستغرق وقتاً إضافياً حسب ضغط الطلبات أو المنطقة أو الظروف الجوية وشركة الشحن. أسعار التوصيل الأساسية: الضفة الغربية 20 شيكل، القدس 30 شيكل، والداخل 70 شيكل. قد تضاف رسوم موضحة مسبقاً للطلبات كبيرة الحجم أو التي تحتاج ترتيبات خاصة. الزبون مسؤول عن صحة رقم الهاتف والعنوان.": [
    "Delivery usually takes one to two days. It may take longer depending on order volume, the area, weather conditions and the carrier. Base delivery fees are ₪20 to the West Bank, ₪30 to Jerusalem and ₪70 to areas inside Israel. Additional fees may apply to bulky orders or orders requiring special arrangements and will be disclosed in advance. Customers are responsible for providing a correct phone number and address.",
    "המשלוח נמשך בדרך כלל יום עד יומיים. ייתכנו עיכובים בהתאם לעומס ההזמנות, לאזור, למזג האוויר ולחברת השילוח. דמי המשלוח הבסיסיים הם 20 ₪ לגדה המערבית, 30 ₪ לירושלים ו־70 ₪ לאזורים בתוך ישראל. על הזמנות גדולות או כאלה שמצריכות סידור מיוחד עשויים לחול חיובים נוספים שיוצגו מראש. באחריות הלקוח למסור כתובת ומספר טלפון נכונים."
  ],
  "يمكن إلغاء الطلب ما دام لم يخرج للتوصيل. بعد خروجه لا يمكن إلغاؤه أو رفض استلامه، وفي حال رفض الاستلام أو تعذر التسليم بسبب الزبون يبقى ملزماً بدفع رسوم التوصيل. الطلبات المخصصة أو المصنوعة حسب الطلب لا يمكن إلغاؤها بعد بدء تجهيزها.": [
    "You may cancel an order before it goes out for delivery. Once it is out for delivery, you cannot cancel it or refuse to accept it. If you refuse it or delivery fails for a reason attributable to you, you remain responsible for the delivery fee. Personalized and made-to-order items cannot be canceled once preparation starts.",
    "אפשר לבטל הזמנה כל עוד לא יצאה למשלוח. לאחר יציאתה אי אפשר לבטל אותה או לסרב לקבל אותה. במקרה של סירוב או של כשל במסירה מסיבה התלויה בלקוח, הלקוח עדיין חייב בדמי המשלוח. אי אפשר לבטל פריטים מותאמים אישית או המיוצרים לפי הזמנה לאחר שהחל תהליך ההכנה."
  ],
  "يمكن طلب الاستبدال خلال يوم واحد من الاستلام بشرط أن يكون المنتج غير مستخدم وبحالته الأصلية مع كامل ملحقاته وتغليفه. لا يوجد استرجاع نقدي. المنتجات المخصصة أو المكتوب عليها أسماء أو عبارات لا تستبدل إلا إذا وصلت خاطئة أو متضررة. يتحمل الزبون تكلفة الاستبدال عند تغيير رأيه، ويتحمل المتجر التكلفة عند الخطأ أو الضرر. يجب فحص الطلب فور استلامه والإبلاغ عن الكسر أو التلف أو النقص خلال ساعتين مع صور واضحة؛ بعد ساعتين لا تقبل بلاغات الضرر الظاهر.": [
    "You may request an exchange within one day of receipt if the item is unused and in its original condition, with all accessories and packaging. Cash refunds are unavailable. Personalized items or items printed with names or phrases may only be exchanged if they arrived incorrect or damaged. Customers cover exchange costs when they change their mind. The store covers costs in case of an error or damage. Inspect your order upon receipt and report breakage, damage or missing items within two hours with clear photos. Reports of visible damage are not accepted after two hours.",
    "אפשר לבקש החלפה בתוך יום אחד מקבלת המוצר, כל עוד לא נעשה בו שימוש והוא במצבו המקורי עם כל האביזרים והאריזה. אין החזר כספי במזומן. פריטים מותאמים אישית או עם שמות או כיתובים ניתנים להחלפה רק אם הגיעו שגויים או פגומים. הלקוח נושא בעלות ההחלפה במקרה של שינוי דעתו, והחנות נושאת בעלות במקרה של טעות או נזק. יש לבדוק את ההזמנה מיד עם קבלתה ולדווח בתוך שעתיים על שבר, נזק או חוסר בצירוף תמונות ברורות. לאחר שעתיים לא יתקבלו דיווחים על נזק נראה לעין."
  ],
  "الضفة الغربية": [
    "West Bank",
    "הגדה המערבית"
  ],
  "القدس": [
    "Jerusalem",
    "ירושלים"
  ],
  "الداخل": [
    "Areas inside Israel",
    "אזורים בתוך ישראל"
  ],
  "ابو غوش": [
    "Abu Ghosh",
    "אבו גוש"
  ]
};
export function localizedStoreCopy(source: string, language: "AR" | "EN" | "HE"): string {
  if (language === "AR") return source;
  return translations[source.trim()]?.[language === "EN" ? 0 : 1] ?? source;
}
