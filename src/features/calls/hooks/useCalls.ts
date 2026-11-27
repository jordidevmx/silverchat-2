// Call log query (6.2): last 100 calls across my active chats, shaped
// client-side (isOutgoing, other participant, self-chat removal).
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-provider";
import {
  attachPostgrestStatus,
  cacheView,
  readCachedView,
  withOfflineFallback,
} from "@/lib/message-cache";
import { supabase } from "@/lib/supabase";
import { isChatCallable } from "../lib/callEligibility";
import type { CallLogEntry } from "../lib/callState";
import type { CallParticipant, CallStatus, CallType } from "../types";

const callsKey = (userId: string) => ["calls", userId] as const;

interface CallsQueryRow {
  id: string;
  chat_id: string;
  type: CallType;
  status: CallStatus;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  decline_reason: string | null;
  ended_reason: string | null;
  initiator_id: string | null;
  chat: { id: string; type: string; status?: string | null; direct_pair_key: string | null };
}

interface MembershipRow {
  chat_id: string;
}

interface ProfileRow {
  id: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  last_seen_at: string | null;
}

async function fetchCalls(userId: string): Promise<CallLogEntry[]> {
  // RLS (calls_select) already restricts rows to active chats I am a member
  // of; the membership pre-fetch only narrows the IN list.
  const membersRes = await supabase.from("chat_members").select("chat_id").eq("user_id", userId);
  if (membersRes.error) throw attachPostgrestStatus(membersRes.error, membersRes.status);
  const memberships = membersRes.data;
  const chatIds = ((memberships ?? []) as MembershipRow[]).map((row) => row.chat_id);
  if (!chatIds.length) return [];

  const callsRes = await supabase
    .from("calls")
    .select(
      `id, chat_id, type, status, started_at, answered_at, ended_at,
       duration_seconds, decline_reason, ended_reason, initiator_id,
       chat:chats!calls_chat_id_fkey(id, type, status, direct_pair_key)`,
    )
    .in("chat_id", chatIds)
    .order("started_at", { ascending: false })
    .limit(100);
  if (callsRes.error) throw attachPostgrestStatus(callsRes.error, callsRes.status);
  const rows = callsRes.data;

  const calls = (rows ?? []) as unknown as CallsQueryRow[];
  const directCalls = calls.filter((call) => call.chat.type === "direct");
  const otherIds = [
    ...new Set(
      directCalls.map(
        (call) =>
          call.chat.direct_pair_key?.split("::").find((id) => id !== userId) ?? call.initiator_id,
      ),
    ),
  ].filter((id): id is string => !!id);
  const [{ data: profiles }, blocksRes] = await Promise.all([
    otherIds.length
      ? supabase
          .rpc("read_profiles_visible", { p_ids: otherIds })
          .select("id, username, display_name, avatar_url, last_seen_at")
          .in("id", otherIds)
      : Promise.resolve({ data: [] as ProfileRow[] | null }),
    supabase.from("user_blocks").select("blocked_id").eq("blocker_id", userId),
  ]);
  const blockedIds = new Set(
    !blocksRes.error ? (blocksRes.data ?? []).map((row) => row.blocked_id) : [],
  );

  const toParticipant = (
    profile: ProfileRow | undefined,
    otherId: string | null,
  ): CallParticipant => {
    if (profile?.id) {
      return {
        id: profile.id,
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        last_seen_at: profile.last_seen_at,
      };
    }
    return {
      id: otherId ?? "",
      display_name: otherId ? `User ${otherId.replace(/-/g, "").slice(0, 8)}` : null,
    };
  };

  return directCalls.map((call) => {
    const otherId =
      call.chat.direct_pair_key?.split("::").find((id) => id !== userId) ?? call.initiator_id;
    const other = (profiles ?? []).find((profile) => profile.id === otherId);
    const isBlocked = Boolean(otherId && blockedIds.has(otherId));
    return {
      id: call.id,
      chatId: call.chat_id,
      type: call.type,
      status: call.status,
      startedAt: call.started_at,
      answeredAt: call.answered_at,
      endedAt: call.ended_at,
      durationSeconds: call.duration_seconds,
      declineReason: call.decline_reason,
      endedReason: call.ended_reason,
      isOutgoing: call.initiator_id === userId,
      canCallBack: isChatCallable({
        type: call.chat.type,
        status: call.chat.status ?? "active",
        isBlocked,
      }),
      other: toParticipant(other, otherId),
    };
  });
}

export function useCalls() {
  const { user, mfaRequired } = useAuth();
  const userId = user?.id ?? "";
  return useQuery({
    queryKey: callsKey(userId),
    queryFn: () =>
      withOfflineFallback({
        fetchOnline: () => fetchCalls(userId),
        writeCache: (calls) => cacheView(userId, "calls", calls),
        readCache: () => readCachedView<CallLogEntry[]>(userId, "calls"),
      }),
    enabled: !!user && !mfaRequired,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
