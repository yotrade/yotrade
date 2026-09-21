/** Languages the commentator can speak. The key travels in the URL, the value is what Kimi is asked for. */
export const LANGUAGES = {
  en: "English",
  id: "Bahasa Indonesia",
  zh: "中文",
  ko: "한국어",
  ja: "日本語",
  es: "Español",
  vi: "Tiếng Việt",
  tr: "Türkçe",
} as const;

export type LanguageCode = keyof typeof LANGUAGES;

export function isLanguage(value: string | null): value is LanguageCode {
  return value !== null && Object.hasOwn(LANGUAGES, value);
}
