export const NOTIF_PROMPT_DISMISSED_KEY = "silverchat_notif_prompt_dismissed";

export function getVapidPublicKey(): string {
  const raw = import.meta.env?.VITE_VAPID_PUBLIC_KEY;
  return typeof raw === "string" ? raw.trim() : "";
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function shouldShowNotificationPrompt({
  userId,
  mfaRequired,
  supported,
  vapidConfigured,
  permission,
  dismissed,
  isIOS,
  isStandalone,
}: {
  userId: string | null;
  mfaRequired: boolean;
  supported: boolean;
  vapidConfigured: boolean;
  permission: NotificationPermission;
  dismissed: boolean;
  isIOS: boolean;
  isStandalone: boolean;
}): boolean {
  if (!userId || mfaRequired) return false;
  if (!supported || !vapidConfigured) return false;
  if (permission !== "default" || dismissed) return false;
  if (isIOS && !isStandalone) return false;
  return true;
}

export type PushSyncIntent = "idle" | "subscribe" | "unsubscribe";

export function resolvePushSyncIntent({
  userId,
  enabled,
  permission,
  supported,
  configured,
  iosBlocked,
}: {
  userId: string | null;
  enabled: boolean | null;
  permission: NotificationPermission;
  supported: boolean;
  configured: boolean;
  iosBlocked: boolean;
}): PushSyncIntent {
  if (!userId || enabled === null) return "idle";
  if (!enabled) return "unsubscribe";
  if (permission !== "granted" || !supported || !configured || iosBlocked) return "idle";
  return "subscribe";
}

export function resolvePushStatusNote({
  iosBlocked,
  supported,
  configured,
  permission,
  subscribed,
  notificationsEnabled,
}: {
  iosBlocked: boolean;
  supported: boolean;
  configured: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
  notificationsEnabled: boolean;
}): string {
  if (iosBlocked) {
    return "Install SilverChat to your Home Screen to enable push notifications on iOS (16.4+).";
  }
  if (!supported) {
    return "Push notifications are not supported by this browser.";
  }
  if (!configured) {
    return "Push notifications are not configured for this environment yet.";
  }
  if (!notificationsEnabled) {
    return "Notifications are turned off for this account.";
  }
  if (permission === "denied") {
    return "Notifications are blocked in your browser settings. Allow them for this site to receive push notifications.";
  }
  if (permission === "granted" && subscribed) {
    return "Push notifications are enabled on this device.";
  }
  if (permission === "default") {
    return "Enable notifications to receive messages and calls when SilverChat is in the background.";
  }
  return "Push notifications require installing the app. In-browser notifications are shown while the app is open in a tab.";
}

export function applicationServerKeysMatch(
  existingKey: ArrayBuffer | null | undefined,
  expectedKey: Uint8Array,
): boolean {
  if (!existingKey) return false;
  const existing = new Uint8Array(existingKey);
  if (existing.length !== expectedKey.length) return false;
  for (let i = 0; i < existing.length; i++) {
    if (existing[i] !== expectedKey[i]) return false;
  }
  return true;
}

const DEFAULT_SW_READY_TIMEOUT_MS = 8_000;

export async function subscribeToPush(
  vapidPublicKey: string = getVapidPublicKey(),
  options: {
    supported?: boolean;
    readyTimeoutMs?: number;
    serviceWorker?: Pick<ServiceWorkerContainer, "ready">;
  } = {},
): Promise<PushSubscription | null> {
  const supported = options.supported ?? isPushSupported();
  if (!supported || !vapidPublicKey) return null;
  const sw = options.serviceWorker ?? navigator.serviceWorker;
  const timeoutMs = options.readyTimeoutMs ?? DEFAULT_SW_READY_TIMEOUT_MS;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const reg = await Promise.race<ServiceWorkerRegistration | null>([
    sw.ready,
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    }),
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
  if (!reg?.pushManager) return null;

  const expectedKey = urlBase64ToUint8Array(vapidPublicKey);
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    const existingKey = existing.options?.applicationServerKey;
    if (!existingKey || applicationServerKeysMatch(existingKey, expectedKey)) {
      return existing;
    }
    await existing.unsubscribe();
  }

  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: expectedKey,
  });
}

export async function unsubscribeFromPush(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg?.pushManager) return;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await sub.unsubscribe();
  }
}
