import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-provider";
import { useMessageText } from "../i18n";
import { filterSearchableMessages } from "../lib/messageSearch";
import type { Message } from "../types";
export function useInChatSearch(messages: Message[]) {
  const { language } = useMessageText();
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(text.trim().toLocaleLowerCase());
      setSelected(null);
    }, 150);
    return () => clearTimeout(timer);
  }, [text]);
  const results = useMemo(
    () => filterSearchableMessages(messages, query, language, user?.id ?? ""),
    [messages, query, language, user?.id],
  );
  const index = Math.max(
    0,
    results.findIndex((m) => m.id === selected),
  );
  const move = (direction: number) => {
    const next = results[(index + direction + results.length) % results.length];
    if (next) setSelected(next.id);
    return next?.id;
  };
  return { text, setText, query, results, index, current: results[index]?.id, move };
}
