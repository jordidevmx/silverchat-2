import { Bell } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/app/providers/i18n-provider";
import { Button } from "@/components/ui/button";
import { useCallStore } from "@/features/calls/stores/callStore";
import { usePreferences } from "@/features/settings/preferences-provider";
import { useAuth } from "@/lib/auth-provider";
import { NOTIF_PROMPT_DISMISSED_KEY, shouldShowNotificationPrompt } from "@/lib/push";
import { useIsIOS } from "@/pwa/useIsIOS";
import { usePushControls } from "@/pwa/usePushSubscription";

function readDismissed(): boolean {
  try {
    return (
      typeof localStorage !== "undefined" &&
      localStorage.getItem(NOTIF_PROMPT_DISMISSED_KEY) === "true"
    );
  } catch {
    return false;
  }
}

function persistDismissed() {
  try {
    localStorage.setItem(NOTIF_PROMPT_DISMISSED_KEY, "true");
  } catch {
    /* Optional storage. */
  }
}

export function NotificationPermissionPrompt() {
  const { user, mfaRequired } = useAuth();
  const { settings } = usePreferences();
  const { isIOS, isStandalone } = useIsIOS();
  const inCall = useCallStore((s) => s.phase !== "idle");
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(readDismissed);
  const activeUserId = user && !mfaRequired ? user.id : null;
  const push = usePushControls(activeUserId, settings ? settings.notifications_enabled : null);

  const visible =
    !inCall &&
    shouldShowNotificationPrompt({
      userId: activeUserId,
      mfaRequired,
      supported: push.supported,
      vapidConfigured: push.configured,
      permission: push.permission,
      dismissed,
      isIOS,
      isStandalone,
    });

  if (!visible) return null;

  const dismiss = () => {
    setDismissed(true);
    persistDismissed();
  };

  const enable = async () => {
    try {
      await push.requestAndSubscribe();
    } finally {
      dismiss();
    }
  };

  return (
    <aside
      aria-label={t("Notifications")}
      className="fixed bottom-[calc(148px+env(safe-area-inset-bottom))] left-4 right-4 z-40 rounded-2xl border border-border/70 bg-card/95 p-4 shadow-xl backdrop-blur-xl md:bottom-20 md:left-auto md:right-4 md:max-w-sm"
    >
      <div className="mb-3 flex items-start gap-2.5 text-sm">
        <Bell size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-neon" />
        <p>
          {t(
            "Enable notifications to receive messages and calls when SilverChat is in the background.",
          )}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          className="flex-1 cursor-pointer"
          onClick={() => void enable()}
        >
          {t("Enable")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="cursor-pointer"
          onClick={dismiss}
        >
          {t("Not now")}
        </Button>
      </div>
    </aside>
  );
}
