import type { QueryClient } from "@tanstack/react-query";

/** Refreshes every surface that derives identity or blocked state, from either entry point. */
export async function invalidateBlockState(cache: QueryClient, userId: string) {
  await Promise.all(
    [
      ["blocked"],
      ["chats"],
      ["chat-detail"],
      ["chat-presence"],
      ["contacts"],
      ["messages"],
      ["contact-profile"],
      ["public-profile"],
      ["avatar-url"],
    ].map((key) => cache.invalidateQueries({ queryKey: [...key, userId] })),
  );
}
