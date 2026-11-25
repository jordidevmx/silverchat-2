import { useRouter } from "@tanstack/react-router";
import { Ban, Check, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useChatUIStore } from "@/features/chat-settings/stores/uiStore";
import { DeleteChatModal } from "@/features/chats/components/DeleteChatModal";
import { useChatMutations } from "@/features/chats/hooks/useChatMutations";
import type { Chat } from "@/features/chats/types";
import { useMessageText } from "../i18n";
import type { ChatDetails } from "../types";

export function BlockedComposerBar({ chat }: { chat: ChatDetails }) {
  const { say } = useMessageText();
  const ui = useChatUIStore();
  const router = useRouter();
  const mutations = useChatMutations();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const contactName = chat.other?.display_name ?? chat.name;
  const deletableChat: Chat = {
    id: chat.id,
    type: chat.type,
    communityId: chat.communityId ?? null,
    displayName: contactName,
    avatarUrl: chat.avatar,
    otherUserId: chat.otherUserId,
    otherUsername: chat.other?.username ?? undefined,
    memberNames: [],
    senderName: "",
    lastMessageAt: null,
    lastMessagePreview: null,
    lastMessageType: null,
    lastMessageStatus: null,
    deletedForEveryone: false,
    isMyLastMessage: false,
    unreadCount: 0,
    manuallyUnread: !!chat.own?.manually_unread,
    pinnedAt: chat.own?.pinned_at ?? null,
    favoritedAt: chat.own?.favorited_at ?? null,
    archivedAt: chat.own?.archived_at ?? null,
    mutedUntil: chat.own?.muted_until ?? null,
    isBlocked: true,
    isLastAdmin: false,
  };

  const handleUnblock = () => {
    if (!chat.otherUserId) return;
    ui.open(chat.id, {
      kind: "block",
      userId: chat.otherUserId,
      name: contactName,
      mode: "unblock",
    });
  };

  const handleConfirmDelete = () => {
    void mutations.run([deletableChat], "delete").then((success) => {
      if (success) {
        setConfirmDelete(false);
        void router.navigate({
          to: "/chats",
          search: {
            filter: "all",
            q: "",
            selectedIds: "",
            select: undefined,
            notice: undefined,
          },
        });
      }
    });
  };

  return (
    <>
      <section
        className="blocked-composer-bar"
        data-slot="blocked-composer-bar"
        aria-label={say("Blocked contact actions", "Acciones de contacto bloqueado")}
      >
        <div className="blocked-composer-panel">
          <div className="blocked-composer-copy" role="status">
            <span className="blocked-composer-icon" aria-hidden="true">
              <Ban size={15} />
            </span>
            <span className="blocked-composer-text">
              <strong>{say(`You blocked ${contactName}`, `Bloqueaste a ${contactName}`)}</strong>
              <small>
                {say(
                  "Unblock to send messages again.",
                  "Desbloquéalo para volver a enviar mensajes.",
                )}
              </small>
            </span>
          </div>
          <div className="blocked-composer-actions">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="blocked-composer-delete"
              disabled={mutations.busy}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={15} aria-hidden="true" />
              <span>{say("Delete chat", "Eliminar chat")}</span>
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="blocked-composer-unblock"
              disabled={mutations.busy || !chat.otherUserId}
              onClick={handleUnblock}
            >
              <Check size={15} aria-hidden="true" />
              <span>{say("Unblock", "Desbloquear")}</span>
            </Button>
          </div>
        </div>
      </section>
      {confirmDelete && (
        <DeleteChatModal
          chats={[deletableChat]}
          busy={mutations.busy}
          error={mutations.error}
          onClose={() => {
            if (!mutations.busy) setConfirmDelete(false);
          }}
          onConfirm={handleConfirmDelete}
        />
      )}
    </>
  );
}
