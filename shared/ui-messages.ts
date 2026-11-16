import {uiMessageDefaults} from "./ui-message-defaults";

/** The store's own interface texts: language code -> key -> text (only what the owner changed). */
export type StoreTexts = Record<string, Record<string, string>>;

export const UI_TEXT_MAX_LENGTH = 2000;
const KEY = /^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/;

export class UiTextError extends Error {}

export function uiTextKeys(): string[] {
  return Object.keys(uiMessageDefaults).sort();
}
export function defaultUiText(key: string, language: string): string | undefined {
  return uiMessageDefaults[key]?.[language];
}

function fill(text: string, vars?: Record<string, string | number>) {
  return vars ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match)) : text;
}

/** Resolves a key: store text, default, then the same for the source content language. Unknown keys return the key. */
export function interfaceText(texts: StoreTexts, key: string, language: string, sourceCode: string, vars?: Record<string, string | number>) {
  const value = texts[language]?.[key] || defaultUiText(key, language) || texts[sourceCode]?.[key] || defaultUiText(key, sourceCode) || defaultUiText(key, "AR") || key;
  return fill(value, vars);
}

/**
 * Validates an owner update: `{[language]: {[key]: text}}`. An empty text removes the store's version
 * (the default shows again). Only known keys and the store's configured languages are accepted.
 */
export function validateUiTextUpdate(input: unknown, languages: string[]): Array<{key: string; language: string; value: string}> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new UiTextError("بيانات النصوص غير صالحة");
  const known = new Set(uiTextKeys()), allowed = new Set(languages), out: Array<{key: string; language: string; value: string}> = [];
  for (const [language, values] of Object.entries(input as Record<string, unknown>)) {
    if (!allowed.has(language)) throw new UiTextError(`اللغة ${language} غير موجودة في إعدادات المتجر`);
    if (!values || typeof values !== "object" || Array.isArray(values)) throw new UiTextError("بيانات النصوص غير صالحة");
    for (const [key, raw] of Object.entries(values as Record<string, unknown>)) {
      if (!KEY.test(key) || !known.has(key)) throw new UiTextError(`مفتاح غير معروف: ${key}`);
      if (typeof raw !== "string") throw new UiTextError(`قيمة غير صالحة للمفتاح ${key}`);
      const value = raw.trim();
      if (value.length > UI_TEXT_MAX_LENGTH) throw new UiTextError(`النص طويل جداً: ${key}`);
      out.push({key, language, value});
    }
  }
  if (out.length > 5000) throw new UiTextError("عدد التعديلات كبير جداً");
  return out;
}
