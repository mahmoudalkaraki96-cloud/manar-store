# مدير أعمال منار
نظام مستقل، خاص بالمالك، لإدارة ثلاثة بزنسات منفصلة. المرحلة الأولى Manar Party فقط.
## البيانات
D1 records: business + kind + payload. المهام والطلبات والمعرفة والتوجيهات تحفظ على الخادم. لا بيانات تجريبية.
## القنوات
Instagram manar_party24 / Facebook ManarParty / WhatsApp +972569208971 / manarstore.ps. جميعها غير متصلة. فحص الكتالوج العام يقرأ فقط.
## حدود المرحلة
لا مدير LLM متصل، لا ردود أو نشر أو إنفاق تلقائي. واجهة المدير تحفظ التوجيه فقط. ربط OpenAI يتطلب مفتاح خادم عبر إعدادات الاستضافة. Meta وWhatsApp يتطلبان ربطًا رسميًا وتحقق webhooks.
المتجر مصدر مستقل للمستلزمات؛ أسعار الصفحة المخصصة ومعرفتها لا تؤخذ منه.
## الأمان
النشر owner-private عبر Sites. لا أسرار في الكود. حدود الإنفاق وتأكيد التصميم والأسعار شرط قبل تفعيل التنفيذ.
## التالي
توصيل مدير فعلي مع أدوات وصلاحيات وسجل؛ API متجر مؤمنة؛ رسائل Meta/WhatsApp؛ استخراج المعرفة من المحادثات؛ حملات وتحليل وSEO.

## تجهيز المدير — 2026-09-30
إضافة /api/manager و lib/manager.mjs عبر Responses API. يقرأ سجلات Manar فقط ويتيح create_task داخليًا. واجهة المحادثة تحفظ رسائل المستخدم والمدير على D1. يمنع أدوات النشر والإنفاق والرسائل. المفتاح OPENAI_API_KEY في أسرار الاستضافة فقط، والنموذج OPENAI_MODEL اختياري. لا مفاتيح في المتصفح.
التحقق المحلي باختبارات استجابات وهمية؛ الاتصال الحقيقي غير مختبر بلا مفتاح. النشر محجوب بفشل شبكة البيئة ورفض التصعيد؛ لا تعتبر النسخة الحية محدثة.

## المرحلة الأولى — تحقق وحماية
مفتاح OPENAI_API_KEY غير موجود في إعدادات الاستضافة. مسار إعداد المفتاح غير متاح. إعادة فتح المصدر فشلت بنفس خطأ اتصال proxy؛ لم تنشر تغييرات هذه المرحلة. إضافة حماية API ترفض الهوية الناقصة، والكتابة للبزنسات غير المفعلة، والبزنس غير المعروف؛ يعتمد إثبات الهوية على رؤوس منصة Sites وحدود نشر المالك الخاص. يتطلب اختبار الرؤوس فعليًا بعد النشر. اختبارات محلية وحفظ المصدر فقط لا تعني اكتمال F03.

## 2026-10-04 — Cost guard and channel prerequisites
- Shared $30 monthly app budget, warning $20, Hebron calendar month. Manager calls now share the future customer-reply budget.
- Atomic D1 reservation $0.05/request prevents concurrent overspend at configured pricing. Three calls maximum, 20 KB serialized request per call, 1400 output tokens each. Fixed gpt-4.1-mini: input $0.40/M, output $1.60/M; cached inputs conservatively charged standard input price.
- Settles to usage-based cost on success. Unknown usage or failed requests keep the reservation; abandoned reservations remain conservative. The meter starts with this deployment; prior usage and key use outside this app are excluded. Provider pricing changes require updating cost rules.
- Global paid-call pause, enforced server-side before every new model call. Already submitted requests may complete.
- Meta is NOT connected. No OAuth/webhook/inbox implemented yet. Prerequisite status shows only environment variable presence, never secrets. Need existing Meta app identity, page authorization and current primary docs before implementing.
- Instagram/Messenger launch remains review-first. WhatsApp, voice, autonomous workers and automatic outbound replies are not enabled.
