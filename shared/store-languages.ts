// Storefront languages are per-store data (store_languages table), never a fixed list in code.
export type LanguageCode = string;
export type TextDirection = "rtl" | "ltr";
export type StoreLanguage = {
  code: LanguageCode;
  name: string;
  dir: TextDirection;
  enabled: boolean;
  isDefault: boolean;
  isSource: boolean;
  sortOrder: number;
};

export const MAX_STORE_LANGUAGES = 12;
const CODE = /^[A-Z]{2,3}(?:-[A-Z0-9]{2,4})?$/;

export class StoreLanguageError extends Error {}

/**
 * Minimal shape used only until the store's own settings arrive (first paint, offline cache miss).
 * The real list always comes from the store's database.
 */
export const bootstrapLanguages: StoreLanguage[] = [
  { code: "AR", name: "العربية", dir: "rtl", enabled: true, isDefault: true, isSource: true, sortOrder: 0 },
];

export function normalizeLanguageCode(value: unknown): LanguageCode {
  return String(value ?? "").trim().toUpperCase().replace(/_/g, "-");
}

/** Validates an admin-submitted list. Throws StoreLanguageError with an Arabic message for the dashboard. */
export function validateStoreLanguages(input: unknown): StoreLanguage[] {
  if (!Array.isArray(input) || input.length === 0) throw new StoreLanguageError("أضف لغة واحدة على الأقل");
  if (input.length > MAX_STORE_LANGUAGES) throw new StoreLanguageError(`الحد الأقصى ${MAX_STORE_LANGUAGES} لغة`);
  const seen = new Set<string>();
  const list = input.map((raw, index): StoreLanguage => {
    if (!raw || typeof raw !== "object") throw new StoreLanguageError("بيانات لغة غير صالحة");
    const item = raw as Record<string, unknown>;
    const code = normalizeLanguageCode(item.code);
    if (!CODE.test(code)) throw new StoreLanguageError(`رمز اللغة «${String(item.code ?? "")}» غير صالح (مثال: AR، EN، FR)`);
    if (seen.has(code)) throw new StoreLanguageError(`اللغة ${code} مكررة`);
    seen.add(code);
    const name = String(item.name ?? "").trim().slice(0, 40);
    if (!name) throw new StoreLanguageError(`اكتب اسم اللغة ${code}`);
    if (item.dir !== "rtl" && item.dir !== "ltr") throw new StoreLanguageError(`حدد اتجاه الكتابة للغة ${code}`);
    for (const key of ["enabled", "isDefault", "isSource"] as const) {
      if (item[key] !== undefined && typeof item[key] !== "boolean") throw new StoreLanguageError("قيمة تفعيل غير صالحة");
    }
    const order = Number(item.sortOrder ?? index);
    return {
      code, name, dir: item.dir,
      enabled: item.enabled !== false,
      isDefault: item.isDefault === true,
      isSource: item.isSource === true,
      sortOrder: Number.isFinite(order) ? Math.max(0, Math.min(999, Math.round(order))) : index,
    };
  });
  const defaults = list.filter(item => item.isDefault), sources = list.filter(item => item.isSource);
  if (defaults.length !== 1) throw new StoreLanguageError("اختر لغة افتراضية واحدة");
  if (sources.length !== 1) throw new StoreLanguageError("اختر لغة المحتوى الأساسية واحدة");
  if (!defaults[0].enabled) throw new StoreLanguageError("اللغة الافتراضية يجب أن تكون مفعّلة");
  if (!sources[0].enabled) throw new StoreLanguageError("لغة المحتوى الأساسية يجب أن تكون مفعّلة");
  return sortLanguages(list);
}

export function sortLanguages(list: StoreLanguage[]): StoreLanguage[] {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
}

/** Tolerant reader for stored/cached data: never throws, always yields a usable list. */
export function readStoreLanguages(input: unknown): StoreLanguage[] {
  try { return validateStoreLanguages(input); } catch { return bootstrapLanguages; }
}

export function enabledLanguages(list: StoreLanguage[]): StoreLanguage[] {
  return sortLanguages(list.filter(item => item.enabled));
}
export function defaultLanguage(list: StoreLanguage[]): StoreLanguage {
  return list.find(item => item.isDefault && item.enabled) || enabledLanguages(list)[0] || bootstrapLanguages[0];
}
export function sourceLanguage(list: StoreLanguage[]): StoreLanguage {
  return list.find(item => item.isSource) || defaultLanguage(list);
}
/** Languages that need translations (everything enabled except the source content language). */
export function translationLanguages(list: StoreLanguage[]): StoreLanguage[] {
  const source = sourceLanguage(list).code;
  return enabledLanguages(list).filter(item => item.code !== source);
}
export function languageDirection(list: StoreLanguage[], code: LanguageCode): TextDirection {
  return (list.find(item => item.code === code) || defaultLanguage(list)).dir;
}
/** BCP-47 tag for <html lang>, Intl and localeCompare ("PT-BR" -> "pt-BR"). */
export function languageTag(code: LanguageCode): string {
  const [base, region] = normalizeLanguageCode(code).split("-");
  return region ? `${base.toLowerCase()}-${region}` : base.toLowerCase();
}
