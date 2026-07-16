import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import de from "./locales/de.json";

const STORAGE_KEY = "app_language";

const saved = typeof localStorage !== "undefined"
  ? localStorage.getItem(STORAGE_KEY)
  : null;

const browserLang = typeof navigator !== "undefined"
  ? navigator.language.split("-")[0]
  : "en";

const defaultLang = saved || (browserLang === "de" ? "de" : "en");

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      de: { translation: de },
    },
    lng: defaultLang,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

export function setLanguage(lang: "en" | "de") {
  i18n.changeLanguage(lang);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, lang);
  }
}

export default i18n;
