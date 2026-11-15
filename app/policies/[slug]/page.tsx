"use client";
import {useStoreLanguage} from "../../store-language";
import StoreHeader from "../../components/StoreHeader";
import PolicySections from "../../components/PolicySections";
export default function PolicyPage(){const {t}=useStoreLanguage();return <main><StoreHeader/><section className="policyPage policyPageModern"><small>{t("حقوقك وطريقة تنفيذ الطلب", "Your rights and how orders work", "הזכויות שלכם ותהליך ההזמנה")}</small><h1>{t("سياسات المتجر", "Store policies", "מדיניות החנות")}</h1><p className="policyIntro">{t("يرجى قراءة السياسات التالية قبل إتمام الطلب. تأكيد الطلب يعني الموافقة عليها.", "Please read these policies before checking out. By confirming your order, you agree to them.", "יש לקרוא את המדיניות לפני השלמת ההזמנה. אישור ההזמנה מהווה הסכמה למדיניות.")}</p><PolicySections mode="full"/></section></main>}
