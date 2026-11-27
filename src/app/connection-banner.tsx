import { WifiOff } from "lucide-react";
import { TopBanner } from "@/components/ui/top-banner";
import { useConnectionHealth } from "@/lib/use-connection-health";
import { shouldShowConnectionBanner } from "@/pwa/connectivityState";
import { useOnlineStatus } from "@/pwa/useOnlineStatus";
import { useI18n } from "./providers/i18n-provider";

export function ConnectionBanner() {
  const online = useOnlineStatus();
  const down = useConnectionHealth();
  const { t } = useI18n();
  if (!shouldShowConnectionBanner({ online, supabaseDown: down })) return null;
  return (
    <TopBanner
      tone="danger"
      role="alert"
      icon={<WifiOff size={18} />}
      className="connection-banner connection-banner-v2"
    >
      {t("Connection issues — some content may be unavailable. Retrying…")}
    </TopBanner>
  );
}
