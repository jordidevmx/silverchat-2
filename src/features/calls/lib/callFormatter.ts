// Call log formatting (6.2/6.3): day grouping and duration/time labels.
// All Intl work is delegated to the shared pure core; public signatures stay unchanged.
import { createFormatters } from "../../../lib/formatters.ts";

const durationFormatter = createFormatters("en");

export function formatDuration(totalSeconds: number): string {
  return durationFormatter.formatDuration(totalSeconds);
}

export interface CallGroup<T> {
  label: string;
  calls: T[];
}

export interface DayLabels {
  today: string;
  yesterday: string;
}

/** Group calls by calendar day (L8): Today / Yesterday / formatted date. */
export function groupCallsByDay<T extends { startedAt: string }>(
  calls: T[],
  labels: DayLabels,
  locale: string,
  now: Date = new Date(),
): CallGroup<T>[] {
  const formatters = createFormatters(locale);
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86_400_000).toDateString();
  const groups = new Map<string, T[]>();
  for (const call of calls) {
    const key = new Date(call.startedAt).toDateString();
    const bucket = groups.get(key);
    if (bucket) bucket.push(call);
    else groups.set(key, [call]);
  }
  return Array.from(groups, ([key, items]) => ({
    label:
      key === today
        ? labels.today
        : key === yesterday
          ? labels.yesterday
          : formatters.formatGroupDate(new Date(key)),
    calls: items,
  }));
}

/** Relative timestamp (6.3): "14:22" today, "Yesterday 14:22", "12/09 14:22". */
export function formatCallTimestamp(
  startedAt: string,
  labels: DayLabels,
  locale: string,
  now: Date = new Date(),
): string {
  const formatters = createFormatters(locale);
  const date = new Date(startedAt);
  const time = formatters.formatTime(date);
  if (date.toDateString() === now.toDateString()) return time;
  if (date.toDateString() === new Date(now.getTime() - 86_400_000).toDateString()) {
    return `${labels.yesterday} ${time}`;
  }
  return `${formatters.formatMonthDay(date)} ${time}`;
}
