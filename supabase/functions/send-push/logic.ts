export interface PushPayloadData {
  url: string;
  call_id?: string;
  [key: string]: unknown;
}

export interface PushRequestPayload {
  user_id: string;
  title: string;
  body?: string;
  tag?: string;
  data: PushPayloadData;
}

export interface DevicePushRow {
  id: string;
  push_subscription: Record<string, unknown> | null;
}

export interface DeliverPushResult {
  sent: number;
  failed: number;
  expiredDeviceIds: string[];
}

export const PUSH_ICON_PATH = "/android-chrome-192x192.png";

export function isAuthorizedServiceRole(
  authHeader: string | null | undefined,
  expectedServiceRoleKey: string | null | undefined,
): boolean {
  if (!authHeader || !expectedServiceRoleKey) return false;
  if (!authHeader.startsWith("Bearer ")) return false;
  const provided = authHeader.slice("Bearer ".length);
  if (provided.length !== expectedServiceRoleKey.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expectedServiceRoleKey.charCodeAt(i);
  }
  return diff === 0;
}

const SANITIZE_ORIGIN = "https://silverchat.internal";

export function sanitizePushUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== "string") return "/chats";
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return "/chats";
  }
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return "/chats";
  }
  try {
    const parsed = new URL(trimmed, SANITIZE_ORIGIN);
    if (parsed.origin !== SANITIZE_ORIGIN || !parsed.pathname.startsWith("/")) {
      return "/chats";
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/chats";
  }
}

export function parsePushRequest(
  raw: unknown,
): { ok: true; payload: PushRequestPayload } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "invalid_payload" };
  }
  const input = raw as Record<string, unknown>;
  const userId = typeof input.user_id === "string" ? input.user_id.trim() : "";
  if (!userId) {
    return { ok: false, error: "user_id required" };
  }
  const title =
    typeof input.title === "string" && input.title.trim() ? input.title.trim() : "SilverChat";
  const body = typeof input.body === "string" ? input.body : undefined;
  const tag = typeof input.tag === "string" && input.tag.trim() ? input.tag.trim() : undefined;
  const rawData =
    input.data && typeof input.data === "object" ? (input.data as Record<string, unknown>) : {};
  const data: PushPayloadData = {
    ...rawData,
    url: sanitizePushUrl(rawData.url),
  };
  return {
    ok: true,
    payload: { user_id: userId, title, body, tag, data },
  };
}

export async function deliverPushToDevices(
  devices: DevicePushRow[],
  payload: PushRequestPayload,
  sendNotification: (
    subscription: Record<string, unknown>,
    serializedBody: string,
  ) => Promise<void>,
): Promise<DeliverPushResult> {
  let sent = 0;
  let failed = 0;
  const expiredDeviceIds: string[] = [];

  const serializedBody = JSON.stringify({
    title: payload.title,
    body: payload.body,
    data: payload.data,
    tag: payload.tag,
    icon: PUSH_ICON_PATH,
    badge: PUSH_ICON_PATH,
  });

  for (const device of devices) {
    if (!device.push_subscription) continue;
    try {
      await sendNotification(device.push_subscription, serializedBody);
      sent++;
    } catch (error: unknown) {
      const statusCode =
        error && typeof error === "object" && "statusCode" in error
          ? Number((error as { statusCode?: unknown }).statusCode)
          : undefined;
      if (statusCode === 404 || statusCode === 410) {
        expiredDeviceIds.push(device.id);
      } else {
        failed++;
      }
    }
  }

  return { sent, failed, expiredDeviceIds };
}
