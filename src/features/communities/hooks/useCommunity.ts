import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-provider";
import {
  attachPostgrestStatus,
  cacheView,
  readCachedView,
  withOfflineFallback,
} from "@/lib/message-cache";
import { supabase } from "@/lib/supabase";
export function useCommunity(communityId: string) {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const router = useRouter();
  const cacheKey = `community:${communityId}`;
  const query = useQuery({
    queryKey: ["community", user?.id, communityId],
    enabled: !!user && !!communityId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: () =>
      withOfflineFallback({
        fetchOnline: async () => {
          const result = await supabase
            .from("community_members")
            .select("role,joined_at,community:communities!inner(*)")
            .eq("user_id", userId)
            .eq("community_id", communityId)
            .maybeSingle();
          if (result.error) throw attachPostgrestStatus(result.error, result.status);
          return result.data
            ? { ...result.data.community, role: result.data.role, joined_at: result.data.joined_at }
            : null;
        },
        writeCache: async (data) => {
          if (data) await cacheView(userId, cacheKey, data);
        },
        readCache: () => readCachedView(userId, cacheKey),
      }),
  });
  useEffect(() => {
    if (communityId && query.isSuccess && !query.data)
      void router.navigate({ href: "/communities", replace: true });
  }, [communityId, query.isSuccess, query.data, router]);
  return query;
}
