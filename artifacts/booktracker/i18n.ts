import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";

import en from "./locales/en.json";
import de from "./locales/de.json";

const STORAGE_KEY = "app_language";

export async function initI18n() {
  let saved: string | null = null;
  try {
    saved = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {}

  const deviceLang = Localization.getLocales()[0]?.languageCode ?? "en";
  const defaultLang = saved ?? (deviceLang === "de" ? "de" : "en");

  await i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      de: { translation: de },
    },
    lng: defaultLang,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    compatibilityJSON: "v4",
  });
}

export async function setLanguage(lang: "en" | "de") {
  await i18n.changeLanguage(lang);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, lang);
  } catch {}
}

export function getCurrentLanguage(): "en" | "de" {
  return (i18n.language?.startsWith("de") ? "de" : "en") as "en" | "de";
}

export default i18n;
