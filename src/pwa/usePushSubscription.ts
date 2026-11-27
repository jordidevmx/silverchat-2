import { useCallback, useEffect } from "react";
import { create } from "zustand";
import { getDeviceName, getOrCreateDeviceFingerprint } from "@/lib/devices";
import {
  getVapidPublicKey,
  isPushSupported,
  resolvePushSyncIntent,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push";
import { supabase } from "@/lib/supabase";
import type { Json } from "@/types/database";
import { useIsIOS } from "./useIsIOS";

function readBrowserPermission(): NotificationPermission {
  if (typeof Notification === "undefined") return "default";
  return Notification.permission;
}

interface PushStoreState {
  permission: NotificationPermission;
  subscribed: boolean;
  setPermission: (permission: NotificationPermission) => void;
  setSubscribed: (subscribed: boolean) => void;
}

const usePushStore = create<PushStoreState>((set) => ({
  permission: readBrowserPermission(),
  subscribed: false,
  setPermission: (permission) => set({ permission }),
  setSubscribed: (subscribed) => set({ subscribed }),
}));

export async function saveDevicePushSubscription(
  userId: string,
  sub: PushSubscription,
): Promise<void> {
  const fingerprint = getOrCreateDeviceFingerprint();
  if (!fingerprint) throw new Error("missing_device_fingerprint");
  const payload = sub.toJSON() as unknown as Json;
  const { error } = await supabase.from("devices").upsert(
    {
      user_id: userId,
      device_fingerprint: fingerprint,
      device_name: getDeviceName(),
      device_type: "web",
      user_agent: navigator.userAgent,
      last_active_at: new Date().toISOString(),
      push_subscription: payload,
    },
    { onConflict: "user_id,device_fingerprint" },
  );
  if (error) throw error;
}

export async function clearDevicePushSubscription(userId: string): Promise<void> {
  const fingerprint = getOrCreateDeviceFingerprint();
  if (!fingerprint) return;
  const { error } = await supabase
    .from("devices")
    .update({ push_subscription: null })
    .eq("user_id", userId)
    .eq("device_fingerprint", fingerprint);
  if (error) throw error;
}

/**
 * Mounted once in AuthenticatedLayout to keep browser permission, PushManager,
 * and `devices.push_subscription` synchronized without competing hook instances.
 */
export function usePushSubscriptionSync(userId: string | null, enabled: boolean | null) {
  const permission = usePushStore((s) => s.permission);
  const setPermission = usePushStore((s) => s.setPermission);
  const setSubscribed = usePushStore((s) => s.setSubscribed);
  const { isIOS, isStandalone } = useIsIOS();

  const supported = isPushSupported();
  const vapidKey = getVapidPublicKey();
  const configured = Boolean(vapidKey);
  const iosBlocked = isIOS && !isStandalone;

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    let active = true;
    let statusObj: PermissionStatus | null = null;
    const sync = () => {
      if (active) setPermission(readBrowserPermission());
    };
    sync();

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
  }, [setPermission]);

  useEffect(() => {
    if (!userId) {
      setSubscribed(false);
      return;
    }

    const intent = resolvePushSyncIntent({
      userId,
      enabled,
      permission,
      supported,
      configured,
      iosBlocked,
    });

    if (intent === "idle") {
      if (enabled !== null && permission !== "granted") {
        setSubscribed(false);
      }
      return;
    }

    let active = true;

    if (intent === "unsubscribe") {
      void (async () => {
        try {
          await unsubscribeFromPush();
          await clearDevicePushSubscription(userId);
        } catch {
          /* Ignore offline/browser errors when clearing subscription. */
        } finally {
          if (active) setSubscribed(false);
        }
      })();
      return () => {
        active = false;
      };
    }

    void (async () => {
      try {
        const sub = await subscribeToPush(vapidKey);
        if (!sub || !active) return;
        await saveDevicePushSubscription(userId, sub);
        if (active) setSubscribed(true);
      } catch {
        if (active) setSubscribed(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [userId, enabled, permission, supported, configured, iosBlocked, vapidKey, setSubscribed]);
}

export function usePushControls(userId: string | null, enabled: boolean | null) {
  const permission = usePushStore((s) => s.permission);
  const subscribed = usePushStore((s) => s.subscribed);
  const setPermission = usePushStore((s) => s.setPermission);
  const setSubscribed = usePushStore((s) => s.setSubscribed);
  const { isIOS, isStandalone } = useIsIOS();

  const supported = isPushSupported();
  const vapidKey = getVapidPublicKey();
  const configured = Boolean(vapidKey);
  const iosBlocked = isIOS && !isStandalone;

  const requestAndSubscribe = useCallback(async (): Promise<NotificationPermission> => {
    if (typeof Notification === "undefined") return "denied";
    const result = await Notification.requestPermission();
    setPermission(result);
    if (
      result === "granted" &&
      userId &&
      enabled !== false &&
      supported &&
      configured &&
      !iosBlocked
    ) {
      try {
        const sub = await subscribeToPush(vapidKey);
        if (sub) {
          await saveDevicePushSubscription(userId, sub);
          setSubscribed(true);
        }
      } catch {
        setSubscribed(false);
      }
    }
    return result;
  }, [userId, enabled, supported, configured, iosBlocked, vapidKey, setPermission, setSubscribed]);

  return {
    permission,
    supported,
    configured,
    subscribed,
    iosBlocked,
    requestAndSubscribe,
  };
}
