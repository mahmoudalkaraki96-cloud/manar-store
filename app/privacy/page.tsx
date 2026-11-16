import {useStoreLanguage} from "../store-language";
import StoreHeader from "../components/StoreHeader";

export default function PrivacyPage(){const {t}=useStoreLanguage();
 return <main><StoreHeader/><article className="privacyPage"><small>{t("privacy.updated")}</small><h1>{t("privacy.title")}</h1><p>{t("privacy.intro")}</p>
 <section><h2>{t("privacy.collect_title")}</h2><ul><li>{t("privacy.collect_account")}</li><li>{t("privacy.collect_order")}</li><li>{t("privacy.collect_usage")}</li><li>{t("privacy.collect_internal")}</li><li>{t("privacy.collect_activity")}</li><li>{t("privacy.collect_local")}</li></ul></section>
 <section><h2>{t("privacy.use_title")}</h2><ul><li>{t("privacy.use_orders")}</li><li>{t("privacy.use_account")}</li><li>{t("privacy.use_security")}</li><li>{t("privacy.use_improve")}</li></ul></section>
 <section><h2>{t("privacy.share_title")}</h2><p>{t("privacy.share_text")}</p></section>
 <section><h2>{t("privacy.cookies_title")}</h2><p>{t("privacy.cookies_text")}</p></section>
 <section><h2>{t("privacy.rights_title")}</h2><p>{t("privacy.rights_text")}</p></section>
 <section><h2>{t("privacy.contact_title")}</h2><p>{t("privacy.contact_text")}</p></section></article></main>
}

