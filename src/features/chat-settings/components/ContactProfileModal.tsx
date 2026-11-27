import {
  Ban,
  Clock,
  ExternalLink,
  MessageCircle,
  Phone,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatSettingsDialog } from "@/components/ui/chat-settings-surfaces";
import { PublicProfileSurface } from "@/components/ui/public-profile-surface";
import { useVoiceCallStart } from "@/features/calls/hooks/useVoiceCallStart";
import type { ChatDetails } from "@/features/messages/types";
import { Avatar, QueryState } from "@/features/settings/components/shared";
import { socialHref } from "@/lib/social-links";
import { useContactProfileActions } from "../hooks/useContactProfileActions";

export function ContactProfileModal({ userId, chat }: { userId: string; chat: ChatDetails }) {
  const {
    query,
    p,
    say,
    language,
    ui,
    action,
    user,
    isBlocked,
    gradient,
    links,
    last,
    callChatId,
    callEligibility,
    sendMessage,
    viewFullProfile,
  } = useContactProfileActions(userId, chat);
  const { start: startCall, isPending: callPending } = useVoiceCallStart();
  const isSelf = userId === user?.id;
  const isOnline = Boolean(last && Date.now() - Date.parse(last) < 120000);
  const resolvedLinks = links.flatMap((link) => {
    const href = socialHref(link.url);
    return href ? [{ key: `${link.label}:${link.url}`, href, label: link.label || link.url }] : [];
  });

  return (
    <ChatSettingsDialog
      title={say("Contact profile", "Perfil del contacto")}
      className="contact-profile-dialog"
      onClose={ui.close}
      canClose={!action.busy}
      lightDismiss
    >
      {(dismiss) => (
        <div className="contact-profile-body">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="contact-close rounded-xl border border-transparent text-muted-foreground hover:border-neon/30 hover:bg-neon/10 hover:text-foreground"
            disabled={action.busy}
            aria-label={say("Close", "Cerrar")}
            onClick={dismiss}
          >
            <X size={18} aria-hidden="true" />
          </Button>
          <QueryState
            loading={query.isPending}
            error={query.error}
            retry={() => void query.refetch()}
          />
          {!query.isPending && !query.error && !p && (
            <p className="contact-profile-empty">
              {say("Profile unavailable", "Perfil no disponible")}
            </p>
          )}
          {p && (
            <PublicProfileSurface
              headingAs="h2"
              gradient={gradient.data}
              avatar={<Avatar profile={p} size="large" />}
              name={p.display_name ?? ""}
              username={p.username ?? ""}
              bio={p.bio}
            >
              {last && (
                <p className="contact-presence" data-online={isOnline || undefined}>
                  {isOnline ? (
                    <>
                      <span className="contact-presence-dot" aria-hidden="true" />
                      <span>{say("Online", "En línea")}</span>
                    </>
                  ) : (
                    <>
                      <Clock size={13} aria-hidden="true" className="contact-presence-icon" />
                      <span>
                        {say("Last seen", "Última conexión")}{" "}
                        {new Intl.DateTimeFormat(language, {
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(new Date(last))}
                      </span>
                    </>
                  )}
                </p>
              )}
              {resolvedLinks.length > 0 && (
                <div className="social-pills">
                  {resolvedLinks.map((link) => (
                    <a
                      key={link.key}
                      href={link.href}
                      className="contact-social-link"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span>{link.label}</span>
                      <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  ))}
                </div>
              )}
              <div className="contact-action-dock">
                <div className="contact-actions-primary" data-single={isSelf || undefined}>
                  <Button
                    type="button"
                    className="contact-action-btn w-full h-auto min-h-[42px] rounded-xl px-4 py-2.5 font-semibold whitespace-normal"
                    disabled={action.busy}
                    onClick={() => void sendMessage()}
                  >
                    <MessageCircle size={16} aria-hidden="true" />
                    {say("Message", "Mensaje")}
                  </Button>
                  {!isSelf && (
                    <Button
                      type="button"
                      variant="outline"
                      className="contact-action-btn contact-action-call w-full h-auto min-h-[42px] rounded-xl px-4 py-2.5 font-semibold whitespace-normal border-neon/35 bg-card/80 text-foreground hover:border-neon/60 hover:bg-neon/10 hover:text-foreground"
                      disabled={
                        !callEligibility.eligible || !callChatId || action.busy || callPending
                      }
                      title={
                        callEligibility.eligible
                          ? say("Start voice call", "Iniciar llamada de voz")
                          : callEligibility.reason === "blocked"
                            ? say(
                                "Unblock this contact to call",
                                "Desbloquea a este contacto para llamar",
                              )
                            : say(
                                "Accept the chat request first",
                                "Acepta la solicitud del chat primero",
                              )
                      }
                      onClick={() => {
                        if (callChatId && callEligibility.eligible) startCall(callChatId, dismiss);
                      }}
                    >
                      <Phone size={16} aria-hidden="true" />
                      {say("Call", "Llamar")}
                    </Button>
                  )}
                </div>
                <div className="contact-actions-secondary">
                  <Button
                    type="button"
                    variant="outline"
                    className="contact-action-btn contact-action-profile w-full h-auto min-h-[40px] rounded-xl px-4 py-2.5 font-medium whitespace-normal border-border bg-muted/60 text-foreground hover:border-neon/45 hover:bg-neon/10 hover:text-foreground"
                    onClick={viewFullProfile}
                  >
                    <UserRound size={16} aria-hidden="true" />
                    {say("View full profile", "Ver perfil completo")}
                  </Button>
                  {!isSelf && (
                    <Button
                      type="button"
                      variant="ghost"
                      className={
                        isBlocked
                          ? "contact-action-btn contact-action-safety w-full h-auto min-h-[38px] rounded-xl px-4 py-2 text-[13px] font-medium whitespace-normal border border-neon/30 bg-neon/8 text-foreground hover:border-neon/55 hover:bg-neon/14 hover:text-foreground"
                          : "contact-action-btn contact-action-safety contact-action-block w-full h-auto min-h-[38px] rounded-xl px-4 py-2 text-[13px] font-medium whitespace-normal border border-destructive/25 bg-destructive/6 hover:border-destructive/45 hover:bg-destructive/14"
                      }
                      data-mode={isBlocked ? "unblock" : "block"}
                      onClick={() =>
                        ui.open(chat.id, {
                          kind: "block",
                          userId,
                          name: p.display_name ?? "",
                          mode: isBlocked ? "unblock" : "block",
                        })
                      }
                    >
                      {isBlocked ? (
                        <ShieldCheck size={16} aria-hidden="true" />
                      ) : (
                        <Ban size={16} aria-hidden="true" />
                      )}
                      {isBlocked ? say("Unblock", "Desbloquear") : say("Block", "Bloquear")}
                    </Button>
                  )}
                </div>
              </div>
              {action.feedback}
            </PublicProfileSurface>
          )}
        </div>
      )}
    </ChatSettingsDialog>
  );
}
