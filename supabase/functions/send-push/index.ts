// TASK-014 (Prompt #13 adapted) — Web Push fan-out Edge Function (Staging).
// Deployed with `--no-verify-jwt` and authenticated strictly via constant-time
// comparison against `SUPABASE_SERVICE_ROLE_KEY` (called by pg_net triggers
// using Vault-stored Staging credentials).
// Secrets (set via `supabase secrets set`): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// optional VAPID_SUBJECT (defaults to mailto:noreply@silverchat.app).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-provided by Supabase.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@4.0.0";
import {
  type DevicePushRow,
  deliverPushToDevices,
  isAuthorizedServiceRole,
  parsePushRequest,
} from "./logic.ts";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!isAuthorizedServiceRole(req.headers.get("Authorization"), serviceRoleKey)) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:noreply@silverchat.app";
  if (!supabaseUrl || !vapidPublicKey || !vapidPrivateKey) {
    return json({ error: "vapid_not_configured" }, 503);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const parsed = parsePushRequest(body);
  if (!parsed.ok) {
    return json({ error: parsed.error }, 400);
  }

  try {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: devices, error: queryError } = await supabase
      .from("devices")
      .select("id, push_subscription")
      .eq("user_id", parsed.payload.user_id)
      .not("push_subscription", "is", null);

    if (queryError) {
      console.error("[send-push] devices query error", queryError.message);
      return json({ error: "devices_query_failed" }, 500);
    }

    const deviceRows = (devices ?? []) as DevicePushRow[];
    if (!deviceRows.length) {
      return json({ sent: 0, removed: 0, failed: 0 }, 200);
    }

    const result = await deliverPushToDevices(
      deviceRows,
      parsed.payload,
      async (subscription, serializedBody) => {
        await webpush.sendNotification(subscription, serializedBody);
      },
    );

    if (result.expiredDeviceIds.length) {
      await supabase
        .from("devices")
        .update({ push_subscription: null })
        .in("id", result.expiredDeviceIds);
    }

    return json(
      {
        sent: result.sent,
        removed: result.expiredDeviceIds.length,
        failed: result.failed,
      },
      200,
    );
  } catch (error) {
    console.error("[send-push] unexpected error", error);
    return json({ error: "internal" }, 500);
  }
});
