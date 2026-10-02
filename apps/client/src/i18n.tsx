import { useSyncExternalStore } from "react";
import messages from "./locales.json";

export const languages = {
  ja: "日本語",
  "ja-easy": "にほんご（やさしい）",
  en: "English",
  zh: "中文",
  vi: "Tiếng Việt",
};
export type Locale = keyof typeof languages;
export function currentLocale(): Locale {
  if (typeof localStorage === "undefined") return "ja";
  const saved = localStorage.getItem("manu-language");
  if (saved && saved in languages) return saved as Locale;
  const browser = navigator.language.split("-")[0];
  return browser in languages ? (browser as Locale) : "en";
}
export function setLocale(locale: Locale) {
  localStorage.setItem("manu-language", locale);
  document.documentElement.lang = locale === "ja-easy" ? "ja" : locale;
  window.dispatchEvent(new Event("manu-language"));
}
const subscribe = (listener: () => void) => {
  window.addEventListener("manu-language", listener);
  return () => window.removeEventListener("manu-language", listener);
};
export function translate(text: string, locale: Locale): string {
  return (
    (messages as Record<string, Record<string, string>>)[locale]?.[text] || text
  );
}
export function useLocale() {
  const locale = useSyncExternalStore(
    subscribe,
    currentLocale,
    () => "ja" as Locale,
  );
  return { locale, t: (text: string) => translate(text, locale) };
}
export function LanguagePicker() {
  const { locale } = useLocale();
  return (
    <div className="language-picker" role="group" aria-label="Language / 言語">
      <span aria-hidden="true">🌐</span>
      {Object.entries(languages).map(([key, name]) => (
        <button
          key={key}
          lang={key === "ja-easy" ? "ja" : key}
          aria-pressed={locale === key}
          onClick={() => setLocale(key as Locale)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}
