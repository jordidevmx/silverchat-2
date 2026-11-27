import { RefreshCw } from "lucide-react";
import { useI18n } from "@/app/providers/i18n-provider";
import { Button } from "@/components/ui/button";
import { useServiceWorkerUpdate } from "@/pwa/useServiceWorkerUpdate";

export function UpdateAvailableBanner() {
  const { needUpdate, reloadToUpdate } = useServiceWorkerUpdate();
  const { t } = useI18n();
  if (!needUpdate) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[calc(80px+env(safe-area-inset-bottom))] left-4 right-4 z-50 flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/95 p-3 shadow-xl backdrop-blur-xl md:left-auto md:right-4 md:max-w-sm lg:bottom-4"
    >
      <span className="text-sm font-medium">{t("New version available.")}</span>
      <Button
        type="button"
        size="sm"
        className="shrink-0 cursor-pointer"
        onClick={() => void reloadToUpdate()}
      >
        <RefreshCw size={14} aria-hidden="true" />
        {t("Reload")}
      </Button>
    </div>
  );
}
