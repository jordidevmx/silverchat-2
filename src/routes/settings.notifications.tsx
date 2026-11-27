import { useI18n } from "@/app/providers/i18n-provider";
import { Button } from "@/components/ui/button";
import { SettingsPage, Toggle } from "@/features/settings/components/presentation";
import { QueryState, useAction } from "@/features/settings/components/shared";
import { useNotificationPreview } from "@/features/settings/hooks/useNotificationPreview";
import { usePreferences } from "@/features/settings/preferences-provider";
import { useAuth } from "@/lib/auth-provider";
import { usePushControls } from "@/pwa/usePushSubscription";
export function NotificationsPage() {
  const { user, mfaRequired } = useAuth();
  const { settings, loading, save } = usePreferences();
  const action = useAction();
  const { preview, setPreview, showPreview } = useNotificationPreview();
  const { t } = useI18n();
  const push = usePushControls(
    user && !mfaRequired ? user.id : null,
    settings ? settings.notifications_enabled : null,
  );

  const pushNote = (() => {
    if (push.iosBlocked) {
      return t(
        "Install SilverChat to your Home Screen to enable push notifications on iOS (16.4+).",
      );
    }
    if (!push.supported) {
      return t("Push notifications are not supported by this browser.");
    }
    if (!push.configured) {
      return t("Push notifications are not configured for this environment yet.");
    }
    if (push.permission === "denied") {
      return t(
        "Notifications are blocked in your browser settings. Allow them for this site to receive push notifications.",
      );
    }
    if (push.permission === "granted" && push.subscribed && settings?.notifications_enabled) {
      return t("Push notifications are enabled on this device.");
    }
    return t(
      "Push notifications require installing the app. In-browser notifications are shown while the app is open in a tab.",
    );
  })();

  return (
    <SettingsPage title="Notifications">
      <QueryState loading={loading} error={null} />
      {settings && (
        <>
          <div className="settings-card settings-card-body">
            <Toggle
              label="Notifications"
              checked={settings.notifications_enabled}
              disabled={action.busy}
              onChange={(v) => {
                setPreview("");
                void action.run(() => save({ notifications_enabled: v }));
              }}
            />
            <Toggle
              label="Sound"
              checked={settings.notification_sound_enabled}
              disabled={action.busy || !settings.notifications_enabled}
              onChange={(v) => void action.run(() => save({ notification_sound_enabled: v }))}
            />
            <Toggle
              label="Message previews"
              checked={settings.notification_previews_enabled}
              disabled={action.busy || !settings.notifications_enabled}
              onChange={(v) => {
                setPreview("");
                void action.run(() => save({ notification_previews_enabled: v }));
              }}
            />
          </div>
          <p className="quiet-note">{pushNote}</p>
          <div className="flex flex-wrap gap-2">
            {settings.notifications_enabled &&
              push.supported &&
              push.configured &&
              !push.iosBlocked &&
              push.permission === "default" && (
                <Button
                  type="button"
                  disabled={action.busy}
                  onClick={() => void push.requestAndSubscribe()}
                >
                  {t("Enable push notifications")}
                </Button>
              )}
            <Button
              variant="outline"
              type="button"
              disabled={!settings.notifications_enabled}
              onClick={() => showPreview(settings)}
            >
              {t("Preview notification")}
            </Button>
          </div>
          {preview && (
            <p className="settings-notice" role="status">
              {preview}
            </p>
          )}
        </>
      )}
      {action.feedback}
    </SettingsPage>
  );
}
