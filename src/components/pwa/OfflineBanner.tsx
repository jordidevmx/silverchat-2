import { WifiOff } from "lucide-react";
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
      className="offline-banner sticky top-0 z-40 flex shrink-0 items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-amber-950"
    >
      <WifiOff size={14} aria-hidden="true" className="shrink-0" />
      <span>{t("You’re offline. Messages will be sent when you reconnect.")}</span>
    </div>
  );
}
