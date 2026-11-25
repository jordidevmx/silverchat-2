import type { Language } from "../../../lib/language.ts";
import { getCallEventSearchText } from "../../calls/lib/callEvent.ts";
import { formatSystemMessageText } from "./systemMessageText.ts";

export interface SearchableMessage {
  id: string;
  type?: string | null;
  content?: string | null;
  deleted_for_everyone?: boolean | null;
}

/** Filters loaded messages against a lowercased search query, matching readable
 * localized labels for call/system events instead of raw serialized payloads. */
export function filterSearchableMessages<T extends SearchableMessage>(
  messages: readonly T[],
  query: string,
  language: Language = "en",
  viewerId = "",
): T[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [];
  return messages.filter((message) => {
    if (message.deleted_for_everyone) return false;
    if (message.type === "system") {
      const callSearch = getCallEventSearchText(message.content, language, viewerId);
      const text =
        callSearch !== null ? callSearch : formatSystemMessageText(message.content, language);
      return text.toLocaleLowerCase().includes(normalized);
    }
    return Boolean(message.content?.toLocaleLowerCase().includes(normalized));
  });
}
