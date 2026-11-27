import { useCallback, useEffect, useState } from "react";

function readPermission(): NotificationPermission {
  if (typeof Notification === "undefined") return "default";
  return Notification.permission;
}

export function useNotificationPermission() {
  const supported = typeof Notification !== "undefined";
  const [permission, setPermission] = useState<NotificationPermission>(readPermission);

  const request = useCallback(async (): Promise<NotificationPermission> => {
    if (typeof Notification === "undefined") return "denied";
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  useEffect(() => {
    if (!supported) return;
    let active = true;
    let statusObj: PermissionStatus | null = null;
    const sync = () => {
      if (active) setPermission(readPermission());
    };

    if (typeof navigator !== "undefined" && navigator.permissions?.query) {
      void navigator.permissions
        .query({ name: "notifications" })
        .then((status) => {
          if (!active) return;
          statusObj = status;
          status.addEventListener("change", sync);
        })
        .catch(() => undefined);
    }

    document.addEventListener("visibilitychange", sync);
    return () => {
      active = false;
      statusObj?.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [supported]);

  return { permission, supported, request };
}
