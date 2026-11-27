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

export async function subscribeToPush(
  vapidPublicKey: string = getVapidPublicKey(),
): Promise<PushSubscription | null> {
  if (!isPushSupported() || !vapidPublicKey) return null;
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;

  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
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
