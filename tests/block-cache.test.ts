import assert from "node:assert/strict";
import test from "node:test";
import { invalidateBlockState } from "../src/features/settings/hooks/blockCache.ts";

test("block state invalidation refreshes every surface that shows a blocked contact", async () => {
  const keys: unknown[][] = [];
  const cache = {
    invalidateQueries: ({ queryKey }: { queryKey: unknown[] }) => {
      keys.push(queryKey);
    },
  };
  await invalidateBlockState(cache as never, "user-1");

  assert.deepEqual(
    keys.map((key) => key[0]),
    [
      "blocked",
      "chats",
      "chat-detail",
      "chat-presence",
      "contacts",
      "messages",
      "contact-profile",
      "public-profile",
      "avatar-url",
    ],
  );
  assert.ok(
    keys.every((key) => key[1] === "user-1"),
    "every cache key must be scoped to the acting user",
  );
});
