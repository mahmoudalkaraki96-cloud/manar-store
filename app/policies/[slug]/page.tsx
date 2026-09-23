"use client";
import StoreHeader from "../../components/StoreHeader";
import PolicySections from "../../components/PolicySections";
export default function PolicyPage(){return <main><StoreHeader/><section className="policyPage policyPageModern"><small>حقوقك وطريقة تنفيذ الطلب</small><h1>سياسات المتجر</h1><p className="policyIntro">يرجى قراءة السياسات التالية قبل إتمام الطلب. تأكيد الطلب يعني الموافقة عليها.</p><PolicySections mode="full"/></section></main>}
