import { RefreshCw, WifiOff } from "lucide-react";
import { useI18n } from "@/app/providers/i18n-provider";
import { shouldShowOfflineBanner } from "@/pwa/connectivityState";
import { useOnlineStatus } from "@/pwa/useOnlineStatus";

export function OfflineBanner() {
  const online = useOnlineStatus();
  const { t } = useI18n();
  if (!shouldShowOfflineBanner(online)) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="offline-banner sticky top-0 z-40 flex shrink-0 items-center justify-center gap-2 border-b border-primary/25 bg-card/95 px-4 py-1.5 text-center text-xs font-medium text-foreground backdrop-blur-md lg:pl-[84px]"
    >
      <WifiOff size={14} aria-hidden="true" className="shrink-0 text-primary" />
      <span>{t("You’re offline. Messages will be sent when you reconnect.")}</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="ml-1 inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20"
      >
        <RefreshCw size={12} aria-hidden="true" />
        {t("Reload")}
      </button>
    </div>
  );
}
