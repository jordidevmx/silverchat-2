// New call FAB sheet: search over callable chats, then start a voice call.
// The camera can be toggled from the in-call controls.
import { Phone } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { useChats } from "@/features/chats/hooks/useChats";
import { QueryState } from "@/features/settings/components/shared";
import { getInitials } from "@/lib/avatar";
import { MAX_TEXT_LENGTH } from "@/lib/text-length";
import { useVoiceCallStart } from "../hooks/useVoiceCallStart";
import { useCallText } from "../i18n";
import { isChatCallable } from "../lib/callEligibility";

export function NewCallModal({ onClose }: { onClose: () => void }) {
  const say = useCallText();
  const [search, setSearch] = useState("");
  const chats = useChats();
  const { start: startCall, isPending } = useVoiceCallStart();

  const candidates = useMemo(() => {
    const callable = (chats.data ?? []).filter((chat) =>
      isChatCallable({ type: chat.type, status: "active", isBlocked: chat.isBlocked }),
    );
    const query = search.trim().toLowerCase();
    if (!query) return callable;
    return callable.filter(
      (chat) =>
        chat.displayName.toLowerCase().includes(query) ||
        (chat.otherUsername ?? "").toLowerCase().includes(query),
    );
  }, [chats.data, search]);

  return (
    <Modal title={say("New call")} onClose={onClose} className="max-w-sm">
      <div className="flex flex-col gap-3 p-4">
        <input
          type="search"
          maxLength={MAX_TEXT_LENGTH}
          aria-label={say("Search chats…")}
          placeholder={say("Search chats…")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="min-h-11 rounded-xl bg-gradient-silver px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {chats.isPending ? (
          <QueryState
            loading={chats.isPending}
            error={chats.error}
            retry={() => void chats.refetch()}
          />
        ) : chats.isError ? (
          <QueryState loading={false} error={chats.error} retry={() => void chats.refetch()} />
        ) : candidates.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            {say("No contacts with active chats. Start a chat first.")}
          </p>
        ) : (
          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {candidates.map((chat) => (
              <li
                key={chat.id}
                className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-muted"
              >
                <Avatar
                  src={chat.avatarUrl ?? undefined}
                  initials={
                    chat.avatarInitials ??
                    getInitials({
                      display_name: chat.displayName,
                      username: chat.otherUsername ?? "",
                    })
                  }
                  size="sm"
                />
                <span className="min-w-0 flex-1 truncate text-sm">{chat.displayName}</span>
                <button
                  type="button"
                  aria-label={`${say("Start voice call")} ${chat.displayName}`}
                  disabled={isPending}
                  onClick={() => startCall(chat.id, onClose)}
                  className="grid size-9 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                >
                  <Phone size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
