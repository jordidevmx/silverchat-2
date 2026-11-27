import { readRawPreference, writePreference } from "./preferences.ts";

export const SUPPORTED_LANGUAGES = ["en", "es"] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = "en";

/**
 * Resolves the first language tag the app supports, ignoring region and script
 * subtags: `es-MX` and `es-ES` both resolve to `es`.
 */
export function matchDeviceLanguage(
  tags: readonly string[],
  fallback: Language = DEFAULT_LANGUAGE,
): Language {
  for (const tag of tags) {
    const primary = tag.split("-")[0]?.trim().toLowerCase();
    const match = SUPPORTED_LANGUAGES.find((language) => language === primary);
    if (match) return match;
  }
  return fallback;
}

/** The language the device asks for, used when no stored preference is valid. */
export function detectDeviceLanguage(): Language {
  if (typeof navigator === "undefined") return DEFAULT_LANGUAGE;
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  return matchDeviceLanguage(tags.filter(Boolean));
}

/** The single stored language key, validated against the supported allow-list. */
export function readStoredLanguage(): Language | null {
  const value = readRawPreference("language");
  return SUPPORTED_LANGUAGES.find((language) => language === value) ?? null;
}

/** Persists the resolved language under the single, stable key. */
export function storeLanguage(language: Language) {
  writePreference("language", language);
}
