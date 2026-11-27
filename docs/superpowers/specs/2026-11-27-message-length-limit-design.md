# Message Length Limit Design

**Date:** 2026-11-27
**Branch / Worktree:** `feat/message-length-limit` (harness worktree `message-length-limit`)
**Status:** Approved (owner asked to implement the recommended approach)

---

## 1. Intent & Problem Statement

SilverChat currently accepts arbitrarily long text in the in-chat composer. `Composer.tsx` renders a raw `<textarea>` with no `maxLength`, the composer controller stores the string as-is (including localStorage drafts), and `deliverOutboxEntry` inserts it directly into `public.messages` through Supabase. No client, RPC, or database rule bounds `messages.content` on INSERT; only media captions are capped at 500 characters on UPDATE (`0010_message_actions.sql`).

Unbounded messages work against the owner's goals: a client can consume storage, memory, bandwidth, and backup costs, and very long messages make conversations slow to load and hard to read on mobile. The limit must therefore hold even when the caller bypasses the UI and writes to Supabase directly.

Other text inputs already carry smaller, product-specific caps (names 50, bio 160, descriptions 500, stories 200, searches 200). Those stay; 10,000 is a universal ceiling, not a replacement.

---

## 2. Goals, Non-Goals, Anti-Goals

### Goals
- Cap every free-text input at 10,000 characters, with the in-chat composer as the primary surface.
- Keep the cap on programmatic text paths in the composer: restored drafts, emoji insertion, and caption text sent with attachments.
- Enforce the same cap in `public.messages` for INSERT and UPDATE so direct Supabase clients cannot exceed it.
- Keep existing stricter caps unchanged, and keep media captions / story replies / channel metadata at their current limits.
- Provide bilingual (en/es) messaging and tests for the new behaviour.

### Non-Goals
- Rate limiting, spam detection, or per-user quotas.
- Changing how messages are stored, encrypted, rendered, or paginated.
- Replacing existing per-field limits with 10,000.
- Truncating or deleting historical messages already longer than 10,000 characters.

### Anti-Goals
- A UI-only cap that a direct Supabase client can bypass.
- A service-side rewrite that abandons the offline outbox.
- Silently poisoning the outbox with messages the database will reject forever.

---

## 3. Approaches Considered

1. **UI-only `maxLength` (dropped):** trivial and migration-free, but trivially bypassable; it does not protect service, storage, or cost.
2. **UI + database CHECK constraint (chosen):** native `maxLength` plus a clamped composer state for programmatic edits, and `CHECK (char_length(content) <= 10000)` on `public.messages`. Defense in depth at the right layers, one small migration, no architectural change.
3. **Netlify/Edge validation endpoint (dropped):** full control but reroutes the send path, breaks the offline outbox, and adds latency for a simple invariant.

---

## 4. Decisions

- **Counting:** 10,000 characters as the browser counts them (UTF-16 code units via `maxLength` / `String.slice`); Postgres uses `char_length()` (Unicode code points). The UI is never more permissive than the database, so an emoji-heavy message is capped no later in the browser than in SQL.
- **Legacy rows:** add the constraint as `NOT VALID`. Existing long rows remain readable; every new INSERT or UPDATE must satisfy it. No data cleanup or destructive migration.
- **Scope of DB enforcement:** only `public.messages.content` (covers normal chats, community chats, channels, captions, and story replies). Other tables keep their existing limits.
- **Counter:** no visible character counter; native `maxLength` gives standard browser feedback and the change stays minimal.
- **Forwarding:** because the forward RPC copies `source.content`, forwarding a pre-existing over-limit message will be rejected by the new constraint. Accepted as a legacy-only edge case; no legacy data is rewritten.

---

## 5. Architecture & Detailed Design

### 5.1 Shared constant

Add `MAX_TEXT_LENGTH = 10_000` in a small shared module (e.g. `src/lib/text-length.ts`) and reuse it in the UI primitives and the message composer. Message-specific code imports the same constant so client and documentation agree on the value.

### 5.2 Shared UI primitives

`src/components/ui/input.tsx` and `src/components/ui/textarea.tsx` default `maxLength` to `MAX_TEXT_LENGTH` when the caller does not specify one. Explicit smaller caller values (50, 160, 200, 500, 6, …) win. Raw text inputs outside the primitives get `maxLength={MAX_TEXT_LENGTH}` where they have no stricter cap; file, checkbox, radio, and range inputs are untouched.

### 5.3 Composer invariant

`useComposerController` clamps text at the source: initial draft text, the exported `setText` used by `onChange`, and `position()` (emoji picker) all go through one `clampText` helper. The raw `<textarea>` in `Composer.tsx` gets `maxLength={MAX_TEXT_LENGTH}`. Attachment captions and `EditMessageModal` text messages inherit the same ceiling; media captions keep their 500 cap.

### 5.4 Database constraint

New migration `supabase/migrations/20261127120000_message_content_length_limit.sql`:

```sql
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_content_length_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_content_length_check
  CHECK (char_length(content) <= 10000) NOT VALID;
```

`NOT VALID` avoids scanning/rewriting history while still rejecting every new or updated row. No RLS or grant changes.

### 5.5 Tests

- SQL: extend `supabase/tests/messages.sql` (rollback-safe) with an over-limit INSERT rejection and an exactly-10,000-character INSERT success, plus an over-limit UPDATE rejection.
- Browser: extend `tests/messages-browser.mjs` so the composer `maxLength` is 10,000 and a 10,001-character paste is clamped before send (no oversized POST).
- Unit/type: `pnpm typecheck` and focused Biome checks on changed files.

---

## 6. Constraints

- Work happens on `feat/message-length-limit` in an isolated worktree; no edits in the primary checkout.
- Migration verification uses Staging (`gffdrrtatxdiucigtwdn`) with `db-guard`; Production requires separate explicit authorization and is not touched.
- No new dependencies.
- All artifacts and user-facing strings are in English source with existing `say(en, es)` translation helpers.
