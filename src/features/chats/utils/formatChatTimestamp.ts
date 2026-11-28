import { createFormatters } from "../../../lib/formatters.ts";

export function formatChatTimestamp(iso: string | null, locale: string, now = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const formatters = createFormatters(locale);
  if (date.toDateString() === now.toDateString()) return formatters.formatTime(date);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString())
    return formatters.formatRelativeAmount(-1, "day");
  return formatters.formatMonthDay(date);
}
