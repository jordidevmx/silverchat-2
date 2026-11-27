import { useRouter } from "@tanstack/react-router";
import { Ban, MoreVertical, Phone, Pin, Search, Users } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { ConversationHeaderSurface } from "@/components/ui/conversation-surface";
import { useVoiceCallStart } from "@/features/calls/hooks/useVoiceCallStart";
import { getCallEligibility } from "@/features/calls/lib/callEligibility";
import { useChatUIStore } from "@/features/chat-settings/stores/uiStore";
import { Avatar } from "@/features/settings/components/shared";
import { useChatPresence } from "../hooks/useChatPresence";
import { useMessageText } from "../i18n";
import type { ChatDetails } from "../types";
export function ChatHeader({
  chat,
  isBlocked = false,
  onSearch,
}: {
  chat: ChatDetails;
  isBlocked?: boolean;
  onSearch: () => void;
}) {
  const ui = useChatUIStore();
  const menuOpen = ui.chatId === chat.id && ui.modal?.kind === "menu";
  const router = useRouter();
  const { say, language } = useMessageText();
  const presence = useChatPresence(chat);
  const { start: startVoiceCall, isPending: callPending } = useVoiceCallStart();
  const last = presence.data?.find((p) => p.id === chat.other?.id)?.last_seen_at;
  const elapsed = last ? Math.max(0, Date.now() - Date.parse(last)) : Infinity;
  const online = elapsed < 120000;
  const relative = Number.isFinite(elapsed)
    ? new Intl.RelativeTimeFormat(language, { numeric: "auto" }).format(
        -Math.floor(
          elapsed / (elapsed < 3600000 ? 60000 : elapsed < 86400000 ? 3600000 : 86400000),
        ),
        elapsed < 3600000 ? "minute" : elapsed < 86400000 ? "hour" : "day",
      )
    : "";
  const subtitle =
    chat.type === "self"
      ? say("Message yourself", "Envíate un mensaje")
      : chat.type === "community_chat"
        ? chat.communityName
        : chat.type === "group"
          ? `${chat.members.length} ${say("members", "miembros")}`
          : isBlocked
            ? say("Messaging disabled", "Mensajes desactivados")
            : online
              ? say("Online", "En línea")
              : last
                ? `${say("Last seen", "Última conexión")} ${relative}`
                : say("Offline", "Desconectado");
  const name = chat.type === "self" ? say("You", "Tú") : chat.name;
  const callEligibility = getCallEligibility({
    ...chat,
    isBlocked: Boolean(isBlocked || chat.isBlocked),
  });
  const showCallTrigger = chat.type === "direct" && !chat.channelMode;
  const callLabel = callEligibility.eligible
    ? say("Start voice call", "Iniciar llamada de voz")
    : callEligibility.reason === "blocked"
      ? say("Unblock this contact to call", "Desbloquea a este contacto para llamar")
      : say("Accept the chat request first", "Acepta la solicitud del chat primero");
  const identity = (
    <>
      {(chat.type === "group" || chat.type === "community_chat") && !chat.avatar ? (
        <span className="group-avatar-placeholder small">
          <Users size={22} />
        </span>
      ) : (
        <Avatar
          profile={
            chat.type === "direct"
              ? (chat.other ?? {})
              : { id: chat.id, display_name: name, avatar_url: chat.avatar }
          }
          size="small"
        />
      )}
      <span>
        <span className="chat-title-row">
          <strong className="chat-title">
            <span>{name}</span>
            {chat.own?.pinned_at && <Pin size={14} aria-label={say("Pinned", "Fijado")} />}
          </strong>
          {isBlocked && (
            <span className="blocked-status-pill" data-slot="blocked-header-badge">
              <Ban size={11} aria-hidden="true" />
              <span>{say("Blocked", "Bloqueado")}</span>
            </span>
          )}
        </span>
        <small>
          {online && chat.type === "direct" && !isBlocked && <i className="presence-dot" />}
          {subtitle}
        </small>
      </span>
    </>
  );
  return (
    <ConversationHeaderSurface
      className={isBlocked ? "is-blocked" : undefined}
      data-blocked={isBlocked ? "true" : undefined}
    >
      {chat.type === "community_chat" && chat.communityId ? (
        <BackButton
          href={`/communities/${chat.communityId}`}
          label={say("Back to community", "Volver a la comunidad")}
          className="conversation-back [.chat-workspace_&]:lg:hidden"
        />
      ) : (
        <BackButton
          href="/chats"
          label={say("Back to chats", "Volver a chats")}
          className="conversation-back [.chat-workspace_&]:lg:hidden"
        />
      )}
      {chat.type === "self" ? (
        <div className="conversation-identity">{identity}</div>
      ) : (
        <button
          type="button"
          className="conversation-identity"
          onClick={() => {
            if (chat.type === "direct") {
              if (chat.otherUserId) ui.open(chat.id, { kind: "contact", userId: chat.otherUserId });
            } else
              void router.navigate({
                href:
                  chat.type === "community_chat"
                    ? `/communities/${chat.communityId}/info`
                    : `/chats/${chat.id}/info`,
              });
          }}
        >
          {identity}
        </button>
      )}
      <div className="conversation-actions">
        <button
          type="button"
          className="message-icon conversation-search-trigger"
          aria-label={say("Search messages", "Buscar mensajes")}
          onClick={onSearch}
        >
          <Search size={20} />
        </button>
        {showCallTrigger && (
          <button
            type="button"
            className="message-icon conversation-call-trigger"
            aria-label={callLabel}
            title={callLabel}
            disabled={!callEligibility.eligible || callPending}
            onClick={() => {
              if (callEligibility.eligible) startVoiceCall(chat.id);
            }}
          >
            <Phone size={20} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className="message-icon"
          aria-label={say("Chat options", "Opciones del chat")}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onPointerDown={menuOpen ? (event) => event.stopPropagation() : undefined}
          onClick={(e) => {
            if (menuOpen) {
              ui.close();
              return;
            }
            const rect = e.currentTarget.getBoundingClientRect();
            ui.open(chat.id, { kind: "menu", x: rect.right - 240, y: rect.bottom + 4 });
          }}
        >
          <MoreVertical size={20} />
        </button>
      </div>
    </ConversationHeaderSurface>
  );
}
