/**
 * Pure Intl formatter core. Shared by the React hook and by the non-React
 * domain formatters so Calls, Chats and Messages cannot drift apart.
 * Native Intl only: no date library, no React, no new dependencies.
 */
export type DateInput = string | number | Date;

export interface Formatters {
  formatTime(value: DateInput): string;
  formatDate(value: DateInput): string;
  formatLongDate(value: DateInput): string;
  formatMonthDay(value: DateInput): string;
  formatGroupDate(value: DateInput): string;
  formatRelative(value: DateInput, now?: Date): string;
  formatRelativeAmount(
    value: number,
    unit: "year" | "month" | "week" | "day" | "hour" | "minute" | "second",
  ): string;
  formatBytes(bytes: number): string;
  formatDuration(seconds: number): string;
}

const BYTE_UNITS = ["B", "KB", "MB", "GB"] as const;

const toDate = (value: DateInput) => (value instanceof Date ? value : new Date(value));

export function createFormatters(locale: string): Formatters {
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  const date = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const longDate = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const monthDay = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit" });
  const groupDate = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  // Scaled units always show one fraction digit so 1 MiB is "1.0 MB" ("1,0 MB" in es).
  // The byte unit stays integral so formatBytes(0) remains "0 B".
  const integer = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  return {
    formatTime: (value) => time.format(toDate(value)),
    formatDate: (value) => date.format(toDate(value)),
    formatLongDate: (value) => longDate.format(toDate(value)),
    formatMonthDay: (value) => monthDay.format(toDate(value)),
    formatGroupDate: (value) => groupDate.format(toDate(value)),
    formatRelative: (value, now = new Date()) => {
      const target = toDate(value);
      const diffSec = Math.floor((now.getTime() - target.getTime()) / 1000);
      if (diffSec < 60) return relative.format(-diffSec, "second");
      if (diffSec < 3600) return relative.format(-Math.floor(diffSec / 60), "minute");
      if (diffSec < 86400) return relative.format(-Math.floor(diffSec / 3600), "hour");
      if (diffSec < 604800) return relative.format(-Math.floor(diffSec / 86400), "day");
      return date.format(target);
    },
    formatRelativeAmount: (value, unit) => relative.format(value, unit),
    formatBytes: (bytes) => {
      const safe = Math.max(0, bytes);
      const index = Math.min(
        BYTE_UNITS.length - 1,
        Math.max(0, Math.floor(Math.log(Math.max(1, safe)) / Math.log(1024))),
      );
      const formatted = (index === 0 ? integer : decimal).format(safe / 1024 ** index);
      return `${formatted} ${BYTE_UNITS[index]}`;
    },
    formatDuration: (seconds) => {
      const total = Math.max(0, Math.floor(seconds));
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const rest = total % 60;
      const mm = String(minutes).padStart(2, "0");
      const ss = String(rest).padStart(2, "0");
      return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
    },
  };
}
