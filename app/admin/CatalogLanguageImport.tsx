"use client";

import { useState } from "react";

type Preview = { matched: number; issues: { line: number; code: string }[]; error?: string };
const issueLabels: Record<string, string> = {
  invalid_target: "معرّف أو حقل غير صالح",
  duplicate_target: "ترجمة مكررة لنفس الحقل",
  missing_or_inactive_target: "الصنف أو الخيار غير موجود أو غير نشط",
  source_changed: "النص العربي تغيّر بعد التصدير",
  unresolved_review: "الترجمة بحاجة لمراجعة",
  invalid_translation: "العبري أو الإنجليزي ناقص أو غير صالح",
};

export default function CatalogLanguageImport() {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<Preview>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(apply: boolean) {
    if (!file || busy) return;
    if (apply && (!preview || preview.issues.length || !preview.matched ||
      !window.confirm("حفظ ترجمات الملف واستبدال دفعة الترجمات المستوردة السابقة؟"))) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/catalog-translations?mode=${apply ? "apply" : "preview"}`, {
        method: "POST",
        headers: { "content-type": "application/x-ndjson" },
        body: file,
      });
      const result = await response.json() as Preview;
      if (result.issues) setPreview(result);
      if (!response.ok) throw new Error(result.error || "تعذر فحص الترجمات");
      if (apply) {
        setMessage(`تم حفظ ${result.matched} خانة ترجمة.`);
        setPreview(undefined);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر استيراد الملف");
    } finally {
      setBusy(false);
    }
  }

  return <section className="dataPanel">
    <h3>استيراد ترجمات الكتالوج</h3>
    <p>ارفع ملف JSONL لمطابقة الترجمات مع الأصناف الحالية. الحفظ يستبدل دفعة الترجمات المستوردة السابقة.</p>
    <input aria-label="ملف ترجمات الكتالوج" type="file" accept=".jsonl,.ndjson" disabled={busy}
      onChange={event => {
        setFile(event.currentTarget.files?.[0]);
        setPreview(undefined);
        setMessage("");
      }}/>
    <button type="button" disabled={busy || !file} onClick={() => void submit(false)}>معاينة الاستيراد</button>
    {preview && <div>
      <p role="status">مطابقة {preview.matched} خانة · {preview.issues.length} مشكلة</p>
      {!!preview.issues.length && <ul>{preview.issues.slice(0, 20).map(issue =>
        <li key={issue.line}>السطر {issue.line} · {issueLabels[issue.code] || issue.code}</li>)}</ul>}
      <button type="button" disabled={busy || !!preview.issues.length || !preview.matched}
        onClick={() => void submit(true)}>حفظ الترجمات</button>
    </div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
