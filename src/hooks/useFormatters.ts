import { useMemo } from "react";

import { useI18n } from "@/app/providers/i18n-provider";
import { createFormatters } from "@/lib/formatters";

/** Locale-aware Intl formatters bound to the current UI language. */
export function useFormatters() {
  const { language } = useI18n();
  return useMemo(() => createFormatters(language), [language]);
}
