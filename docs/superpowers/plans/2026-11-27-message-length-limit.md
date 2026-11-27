# Message Length Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cap every free-text input at 10,000 characters and enforce the same cap on `public.messages.content` so direct Supabase clients cannot bypass it.

**Architecture:** A shared `MAX_TEXT_LENGTH`/`clampText` helper feeds native `maxLength` on UI primitives and the in-chat textarea, while the composer controller clamps every programmatic text path (drafts, emoji insertion, caption state). A `NOT VALID` CHECK constraint on `messages.content` enforces the invariant at the storage layer without rewriting historical rows.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Node test runner (`--experimental-strip-types`), Playwright-core browser suites, Supabase CLI 3.4 / Postgres, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-27-message-length-limit-design.md`

## Global Constraints

- Limit is **10,000 characters**, counted as browser `maxLength` / UTF-16 code units; Postgres uses `char_length()`.
- Existing smaller caps (50, 160, 200, 500, 254, 10, 6) stay unchanged; 10,000 is only a ceiling.
- No new dependencies.
- All new code, comments, and docs in English; user-facing strings use the existing `say(en, es)` helper.
- Migration verification uses Staging `gffdrrtatxdiucigtwdn` only. Every Staging write must be preceded by `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn` exiting 0. Production is out of scope.
- Work stays on branch `feat/message-length-limit` in the isolated worktree; no edits in the primary checkout.
- One commit at the end of the completed turn (AGENTS.md overrides per-task commits).

## Review Focus

- Direct `POST /rest/v1/messages` with 10,001 characters must be rejected by the DB — pinned in Task 3's SQL test.
- A restored localStorage draft longer than 10,000 characters must be clamped before it reaches the composer — pinned in Task 2's browser test.
- Emoji picker insertion that would push composer text past 10,000 must clamp — pinned by Task 1's `clampText` unit test through the shared helper used by `position()`.
- An existing message updated to 10,001 characters must be rejected — pinned in Task 3's SQL test.
- Existing strict caps must survive (profile bio 160, search fields 200, media captions 500) — pinned by Task 2's browser assertions and the Task 1 code review.

---

### Task 1: Shared 10,000-character helper and UI defaults

**Files:**
- Create: `src/lib/text-length.ts`
- Create: `tests/text-length.test.ts`
- Modify: `src/components/ui/input.tsx`, `src/components/ui/textarea.tsx`
- Modify: `src/features/chat-settings/components/AddMembersModal.tsx:70`, `src/features/settings/components/ManageExclusionsModal.tsx:31`, `src/features/chat-growth/components/ChannelInviteAdminModal.tsx:183`, `src/features/calls/components/CallsPage.tsx:61`, `src/features/calls/components/NewCallModal.tsx:36`, `src/features/settings/components/DeleteAccountModal.tsx:22`, `src/features/communities/components/CommunitySettingsActions.tsx:193`

**Interfaces:**
- Consumes: nothing.
- Produces: `MAX_TEXT_LENGTH: 10_000` and `clampText(value: string): string` (returns `value.slice(0, MAX_TEXT_LENGTH)`), both imported with relative/alias paths by later tasks.

- [ ] **Step 1: Write the failing test** in `tests/text-length.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { clampText, MAX_TEXT_LENGTH } from "../src/lib/text-length.ts";

test("clampText keeps short text unchanged", () => {
  assert.equal(clampText("hola"), "hola");
});

test("clampText truncates at 10,000 characters", () => {
  assert.equal(MAX_TEXT_LENGTH, 10_000);
  assert.equal(clampText("x".repeat(10_001)).length, 10_000);
  assert.equal(clampText("🙂".repeat(10_001)).length, 10_000);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test tests/text-length.test.ts`
Expected: FAIL — module `../src/lib/text-length.ts` not found.

- [ ] **Step 3: Implement `src/lib/text-length.ts`**

Export `MAX_TEXT_LENGTH = 10_000` and `clampText(value: string): string` returning `value.slice(0, MAX_TEXT_LENGTH)`. No other exports.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --experimental-strip-types --test tests/text-length.test.ts`
Expected: PASS (3 assertions across 2 tests).

- [ ] **Step 5: Default `maxLength` in the shared primitives**

In `src/components/ui/input.tsx` and `src/components/ui/textarea.tsx`, destructure `maxLength = MAX_TEXT_LENGTH` from props, pass `maxLength={maxLength}` before `{...props}`, and import from `@/lib/text-length`. Caller-supplied values must still win.

- [ ] **Step 6: Cap raw text inputs that have no stricter limit**

Add `maxLength={MAX_TEXT_LENGTH}` and the import to each raw text/search input listed in Files. Do not touch checkbox, file, number, radio, or range inputs, and do not change any input that already has a `maxLength`.

- [ ] **Step 7: Verify types and format**

Run: `pnpm typecheck`
Run: `pnpm exec biome check src/lib/text-length.ts tests/text-length.test.ts src/components/ui/input.tsx src/components/ui/textarea.tsx <the seven modified component files>`
Expected: both pass.

---

### Task 2: Clamp the in-chat composer and edit dialog

**Files:**
- Modify: `tests/messages-browser.mjs`
- Modify: `src/features/messages/components/Composer.tsx:160`
- Modify: `src/features/messages/hooks/useComposerController.ts:47,76,283-291`
- Modify: `src/features/messages/components/EditMessageModal.tsx:40`

**Interfaces:**
- Consumes: `MAX_TEXT_LENGTH`, `clampText` from Task 1.
- Produces: no new exports; the composer's exported `setText` becomes clamped, and `Composer.tsx` exposes `maxlength="10000"` on its textarea.

- [ ] **Step 1: Write the failing browser assertions** in `tests/messages-browser.mjs`

Immediately after the first `await goto();` in the `try` block, assert:

```js
const composer = page.getByRole("textbox", { name: "Message", exact: true });
assert.equal(await composer.getAttribute("maxlength"), "10000");
```

After the existing draft-persistence assertions (around line 440), seed an over-limit draft and assert it is clamped on load:

```js
await page.evaluate(
  ({ key, value }) => localStorage.setItem(key, value),
  {
    key: `silverchat_draft_${chatId}`,
    value: JSON.stringify({
      text: "x".repeat(12_000),
      mediaUrls: [],
      replyToId: null,
      updatedAt: new Date().toISOString(),
      ownerId: me,
    }),
  },
);
await goto();
assert.equal((await composer.inputValue()).length, 10_000);
```

- [ ] **Step 2: Run the browser suite to verify it fails**

Start an isolated dev server with disposable `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_TURNSTILE_SITE_KEY` on port 5175, then run `UI_BASE_URL=http://127.0.0.1:5175 node tests/messages-browser.mjs`.
Expected: FAIL — `maxlength` is `null` and the seeded draft loads with 12,000 characters.

- [ ] **Step 3: Clamp every composer text path**

In `useComposerController.ts`, import `clampText`/`MAX_TEXT_LENGTH`, initialize `text` from `clampText(initialDraft?.text ?? "")`, initialize `caret`/`selection` from the clamped value, and make the exported `setText` call `clampText` before `setState`. Route `position()` through that same clamped setter. Add `maxLength={MAX_TEXT_LENGTH}` to the raw `<textarea>` in `Composer.tsx`. In `EditMessageModal.tsx:40`, replace the `maxLength={message.type === "text" ? undefined : 500}` expression with `maxLength={message.type === "text" ? MAX_TEXT_LENGTH : 500}`.

- [ ] **Step 4: Run the browser suite to verify it passes**

Run: `UI_BASE_URL=http://127.0.0.1:5175 node tests/messages-browser.mjs`
Expected: PASS, including all pre-existing send, retry, draft, mention, and multiline assertions.

- [ ] **Step 5: Verify types and format**

Run: `pnpm typecheck`
Run: `pnpm exec biome check tests/messages-browser.mjs src/features/messages/components/Composer.tsx src/features/messages/hooks/useComposerController.ts src/features/messages/components/EditMessageModal.tsx`
Expected: both pass.

---

### Task 3: Enforce the limit in Postgres

**Files:**
- Modify: `supabase/tests/messages.sql`
- Create: `supabase/migrations/20261127120000_message_content_length_limit.sql`

**Interfaces:**
- Consumes: none.
- Produces: constraint `messages_content_length_check` on `public.messages`.

- [ ] **Step 1: Add the failing SQL assertions** at the end of `supabase/tests/messages.sql`, just before `ROLLBACK;`:

```sql
-- Message content is bounded at 10,000 characters on INSERT and UPDATE.
SELECT set_config('request.jwt.claims','{"sub":"d1111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.rejects(format('INSERT INTO public.messages(chat_id,sender_id,content) VALUES(%L,auth.uid(),repeat(''x'',10001))',current_setting('test.group_id')::uuid),'messages_content_length_check');
WITH bounded AS (INSERT INTO public.messages(chat_id,sender_id,content) VALUES(current_setting('test.group_id')::uuid,auth.uid(),repeat('x',10000)) RETURNING id)
SELECT set_config('test.bounded_id',id::text,true) FROM bounded;
SELECT pg_temp.rejects(format('UPDATE public.messages SET content=repeat(''y'',10001) WHERE id=%L',current_setting('test.bounded_id')::uuid),'messages_content_length_check');
RESET ROLE;
```

- [ ] **Step 2: Link the worktree to Staging and run the guard**

Run: `powershell -File scripts/setup-supabase.ps1 -Staging`
Run: `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn`
Expected: guard exits 0.

- [ ] **Step 3: Run the SQL suite to verify it fails**

Run: `pnpm test:db --staging supabase/tests/messages.sql`
Expected: FAIL with `Statement unexpectedly succeeded` for the 10,001-character INSERT.

- [ ] **Step 4: Add the migration** `supabase/migrations/20261127120000_message_content_length_limit.sql`:

```sql
-- Bound message content at 10,000 characters without rewriting historical rows.
BEGIN;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_content_length_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_content_length_check
  CHECK (char_length(content) <= 10000) NOT VALID;

COMMIT;
```

- [ ] **Step 5: Apply the migration to Staging**

Run: `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn`
Run: `pnpm exec supabase migration list --remote=gffdrrtatxdiucigtwdn`
Run: `pnpm exec supabase db push --dry-run --remote=gffdrrtatxdiucigtwdn`
Run: `pnpm exec supabase db push --remote=gffdrrtatxdiucigtwdn --yes`
If Staging contains a foreign unmerged migration, follow AGENTS.md: apply only this file with `supabase db query --remote=... --yes -f ...`, then `supabase migration repair --status applied <version> --remote=... --yes`. Never revert a foreign migration.

- [ ] **Step 6: Run the SQL suite to verify it passes**

Run: `pnpm test:db --staging supabase/tests/messages.sql`
Expected: PASS — 10,001-character INSERT and UPDATE rejected by `messages_content_length_check`; exactly 10,000-character INSERT succeeds.

- [ ] **Step 7: Lint the remote schema**

Run: `pnpm exec supabase db lint --remote=gffdrrtatxdiucigtwdn`
Expected: no new warnings attributable to this migration.

---

### Task 4: Final verification and commit

**Files:** none (verification only).

- [ ] **Step 1: Run focused tests**

Run: `node --experimental-strip-types --test tests/text-length.test.ts`
Run: `pnpm test:messages`
Expected: both pass.

- [ ] **Step 2: Run broader checks**

Run: `pnpm typecheck`
Run: `pnpm exec biome check <all changed JS/TS/JSON files>`
Expected: both pass.

- [ ] **Step 3: Review the branch before committing**

Run: `git status --short`
Run: `git diff --stat origin/main..HEAD`
Run: `git log --oneline origin/main..HEAD`
Expected: only files listed in Tasks 1–3 plus the two design/plan docs; no unrelated changes.

- [ ] **Step 4: Commit once**

```bash
git add <the files from Tasks 1-3 and docs/superpowers/specs/2026-11-27-message-length-limit-design.md docs/superpowers/plans/2026-11-27-message-length-limit.md>
git commit -m "feat: cap chat messages and text inputs at 10,000 characters"
```
