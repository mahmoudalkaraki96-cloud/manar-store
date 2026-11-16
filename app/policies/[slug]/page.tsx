"use client";
import {useStoreLanguage} from "../../store-language";
import StoreHeader from "../../components/StoreHeader";
import PolicySections from "../../components/PolicySections";
export default function PolicyPage(){const {t}=useStoreLanguage();return <main><StoreHeader/><section className="policyPage policyPageModern"><small>{t("your_rights_and_how_orders_work")}</small><h1>{t("store_policies")}</h1><p className="policyIntro">{t("please_read_these_policies_before_checking_out_b")}</p><PolicySections mode="full"/></section></main>}
