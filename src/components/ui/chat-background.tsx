import { useChatBackground } from "@/app/providers/chat-background-provider";
import { ChatDoodlePattern } from "./chat-doodle-pattern";

/** Decorative background of the conversation canvas; the default is the original doodle. */
export function ChatBackgroundHost() {
  const { selection, dim, customUrl } = useChatBackground();
  if (selection.kind === "default") return <ChatDoodlePattern />;

  const isCustom = selection.kind === "custom";
  const source = isCustom ? "custom" : selection.preset;
  return (
    <div className="chat-background" aria-hidden="true" data-background={source}>
      <div
        key={customUrl ?? source}
        className={`chat-background-image chat-background-${source}`}
        style={isCustom && customUrl ? { backgroundImage: `url("${customUrl}")` } : undefined}
      />
      <div className="chat-background-scrim" style={{ opacity: dim / 100 }} />
    </div>
  );
}
