import { createFormatters } from "../../../lib/formatters.ts";

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export const formatMessageTime = (iso: string, locale: string) =>
  createFormatters(locale).formatTime(iso);

export function dateLabel(iso: string, locale: string, now = new Date()) {
  const formatters = createFormatters(locale);
  const day = new Date(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  // Intl yields lowercase "today"/"yesterday"; the timeline labels are capitalized.
  if (day.toDateString() === now.toDateString())
    return capitalize(formatters.formatRelativeAmount(0, "day"));
  if (day.toDateString() === yesterday.toDateString())
    return capitalize(formatters.formatRelativeAmount(-1, "day"));
  return formatters.formatLongDate(iso);
}

export function formatBytes(bytes: number, locale: string) {
  return createFormatters(locale).formatBytes(bytes);
}
