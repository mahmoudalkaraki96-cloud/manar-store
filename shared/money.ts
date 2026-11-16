// Prices, numbers and dates follow the store's settings (currency, symbol, digits) and the visitor's language.
/** A Unicode numbering system code such as "latn" (123), "arab" (١٢٣) or "arabext" (۱۲۳). */
export type DigitStyle = string;
export const DEFAULT_DIGITS = "latn";

export function validDigits(value: unknown): value is string {
  if (typeof value !== "string" || !/^[a-z]{3,8}$/.test(value)) return false;
  const supported = (Intl as unknown as {supportedValuesOf?: (key: string) => string[]}).supportedValuesOf?.("numberingSystem");
  if (supported) return supported.includes(value);
  try { return new Intl.NumberFormat(`en-u-nu-${value}`).resolvedOptions().numberingSystem === value; } catch { return false; }
}
export type MoneySettings = {currency: string; currencySymbol?: string; digits?: DigitStyle};

const CURRENCY = /^[A-Z]{3}$/;

export function validCurrency(code: unknown): code is string {
  if (typeof code !== "string" || !CURRENCY.test(code)) return false;
  try { new Intl.NumberFormat("en", {style: "currency", currency: code}); return true; } catch { return false; }
}

/** Locale for Intl: the visitor's language tag with the store's numbering system. */
export function formatLocale(languageTag: string, digits: DigitStyle = DEFAULT_DIGITS) {
  const system = validDigits(digits) ? digits : DEFAULT_DIGITS;
  let tag = languageTag || "en";
  try { Intl.getCanonicalLocales(tag); } catch { tag = "en"; }
  return `${tag}-u-nu-${system}`;
}

export function formatNumber(value: number, languageTag: string, digits: DigitStyle = DEFAULT_DIGITS, maximumFractionDigits = 2) {
  return new Intl.NumberFormat(formatLocale(languageTag, digits), {maximumFractionDigits}).format(Number(value) || 0);
}

export function formatMoney(amount: number, settings: MoneySettings, languageTag: string) {
  const value = Math.round((Number(amount) || 0) * 100) / 100;
  const locale = formatLocale(languageTag, settings.digits);
  const symbol = (settings.currencySymbol || "").trim();
  if (validCurrency(settings.currency)) {
    const parts = new Intl.NumberFormat(locale, {style: "currency", currency: settings.currency, minimumFractionDigits: 0, maximumFractionDigits: 2}).formatToParts(value);
    return symbol ? parts.map(part => (part.type === "currency" ? symbol : part.value)).join("").trim() : parts.map(part => part.value).join("");
  }
  return `${formatNumber(value, languageTag, settings.digits)} ${symbol || settings.currency || ""}`.trim();
}

export function formatMoneyRange(min: number, max: number, settings: MoneySettings, languageTag: string) {
  return min === max ? formatMoney(min, settings, languageTag) : `${formatMoney(min, settings, languageTag)} – ${formatMoney(max, settings, languageTag)}`;
}

export function formatDate(value: number | string | Date, languageTag: string, digits: DigitStyle = DEFAULT_DIGITS) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(formatLocale(languageTag, digits), {year: "numeric", month: "short", day: "numeric"}).format(date);
}
