import { useQuery } from "@tanstack/react-query";
import { allRows } from "@/features/chats/hooks/useChats";
import { useAuth } from "@/lib/auth-provider";
import { cacheView, readCachedView, withOfflineFallback } from "@/lib/message-cache";
import { supabase } from "@/lib/supabase";
import { orderCommunities } from "../lib/communityActions";
export function useCommunities() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  return useQuery({
    queryKey: ["communities", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: () =>
      withOfflineFallback({
        fetchOnline: async () => {
          const rows = await allRows((from, to) =>
            supabase
              .from("community_members")
              .select("role,joined_at,community:communities!inner(*)")
              .eq("user_id", userId)
              .order("community_id")
              .range(from, to),
          );
          return orderCommunities(
            rows.map((row) => ({ ...row.community, role: row.role, joined_at: row.joined_at })),
          );
        },
        writeCache: (data) => cacheView(userId, "communities", data),
        readCache: () => readCachedView<ReturnType<typeof orderCommunities>>(userId, "communities"),
      }),
  });
}
