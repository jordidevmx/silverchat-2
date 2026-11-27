// 6.1 — Calls page: header, All/Missed filter chips, day-grouped log
// (last 100), search, and the NewCallFAB.
import { Phone } from "lucide-react";
import { useMemo, useState } from "react";
import { useI18n } from "@/app/providers/i18n-provider";
import { FloatingActionButton } from "@/components/ui/floating-action-button";
import { QueryState } from "@/features/settings/components/shared";
import { MAX_TEXT_LENGTH } from "@/lib/text-length";
import { useCalls } from "../hooks/useCalls";
import { useVoiceCallStart } from "../hooks/useVoiceCallStart";
import { useCallText } from "../i18n";
import { groupCallsByDay } from "../lib/callFormatter";
import type { CallLogEntry } from "../lib/callState";
import { CallLogItem } from "./CallLogItem";
import { NewCallModal } from "./NewCallModal";

type CallsFilter = "all" | "missed";

export function CallsPage() {
  const say = useCallText();
  const { language } = useI18n();
  const calls = useCalls();
  const { start: startCall, isPending: callPending } = useVoiceCallStart();
  const [filter, setFilter] = useState<CallsFilter>("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const visible = useMemo(() => {
    let entries = calls.data ?? [];
    if (filter === "missed") {
      entries = entries.filter((entry) => entry.status === "missed");
    }
    const query = search.trim().toLowerCase();
    if (query) {
      entries = entries.filter(
        (entry) =>
          (entry.other.display_name ?? "").toLowerCase().includes(query) ||
          (entry.other.username ?? "").toLowerCase().includes(query),
      );
    }
    return entries;
  }, [calls.data, filter, search]);

  const groups = useMemo(
    () =>
      groupCallsByDay(
        visible,
        { today: say("Today"), yesterday: say("Yesterday") },
        language === "es" ? "es" : "en",
      ),
    [visible, say, language],
  );

  const onCall = (entry: CallLogEntry) => startCall(entry.chatId);

  return (
    <main id="main" className="mx-auto w-full max-w-2xl px-4 pt-6 pb-24">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">{say("Calls")}</h1>
        <p className="text-sm text-muted-foreground">{say("Recent voice and video activity")}</p>
      </header>
      <input
        type="search"
        maxLength={MAX_TEXT_LENGTH}
        aria-label={say("Search calls…")}
        placeholder={say("Search calls…")}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="mb-3 min-h-11 w-full rounded-xl bg-gradient-silver px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="mb-3 flex gap-2" role="tablist" aria-label={say("Calls")}>
        {(["all", "missed"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            onClick={() => setFilter(value)}
            className={`cursor-pointer rounded-full px-4 py-1.5 text-sm transition-colors ${
              filter === value
                ? "bg-neon bg-gradient-neon text-primary-foreground shadow-glow"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {value === "all" ? say("All") : say("Missed")}
          </button>
        ))}
      </div>
      {calls.isPending ? (
        <QueryState
          loading={calls.isPending}
          error={calls.error}
          retry={() => void calls.refetch()}
        />
      ) : calls.isError ? (
        <QueryState loading={false} error={calls.error} retry={() => void calls.refetch()} />
      ) : visible.length === 0 ? (
        <div className="grid place-items-center gap-2 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
            <Phone size={20} />
          </span>
          <p className="text-sm text-muted-foreground">
            {filter === "missed"
              ? say("No missed calls")
              : say("Voice and video calls with your contacts will appear here.")}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <section key={group.label}>
              <h2 className="px-3 pb-1 text-xs font-medium text-muted-foreground">{group.label}</h2>
              <ul>
                {group.calls.map((entry) => (
                  <CallLogItem
                    key={entry.id}
                    entry={entry}
                    locale={language === "es" ? "es" : "en"}
                    onCall={onCall}
                    callPending={callPending}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <FloatingActionButton
        kind="calls"
        aria-label={say("New call")}
        className="fixed right-5 bottom-[calc(var(--shell-tab-height,64px)+16px)] z-20"
        onClick={() => setCreating(true)}
      />
      {creating && <NewCallModal onClose={() => setCreating(false)} />}
    </main>
  );
}
