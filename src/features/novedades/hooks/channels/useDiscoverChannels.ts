import { useQuery } from "@tanstack/react-query";
import { allRows } from "@/features/chats/hooks/useChats";
import { useAuth } from "@/lib/auth-provider";
import {
  attachPostgrestStatus,
  cacheView,
  readCachedView,
  withOfflineFallback,
} from "@/lib/message-cache";
import { supabase } from "@/lib/supabase";
import { type Channel, mapPublicChannelRow } from "../../types";
export function useDiscoverChannels() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  return useQuery({
    queryKey: ["discover-channels", user?.id],
    // Focus refetches stay disabled to prevent request bursts when switching windows.
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
    queryFn: () =>
      withOfflineFallback({
        fetchOnline: async () => {
          const follows = await allRows((from, to) =>
            supabase
              .from("channel_followers")
              .select("channel_id")
              .eq("user_id", userId)
              .order("channel_id")
              .range(from, to),
          );
          const ids = new Set(follows.map((f) => f.channel_id));
          const result: Channel[] = [];
          // Scan ordered pages to return exactly the top 20 not followed, without an oversized NOT IN URL.
          for (let offset = 0; result.length < 20; offset += 100) {
            const r = await supabase
              .rpc("read_channels_public", { p_offset: offset, p_limit: 100 }, { get: true })
              .select("*")
              .order("follower_count", { ascending: false })
              .order("id")
              .limit(100);
            if (r.error) throw attachPostgrestStatus(r.error, r.status);
            const rows = (r.data ?? [])
              .map(mapPublicChannelRow)
              .filter((c) => c.id && !ids.has(c.id));
            result.push(...rows);
            if ((r.data?.length ?? 0) < 100) break;
          }
          return result.slice(0, 20);
        },
        writeCache: (data) => cacheView(userId, "discover-channels", data),
        readCache: () => readCachedView<Channel[]>(userId, "discover-channels"),
      }),
  });
}
