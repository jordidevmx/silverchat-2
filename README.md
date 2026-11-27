# SilverChat

Privacy-first messaging web app with a futuristic silver + electric-blue design
language. Real-time chats, stories, channels, communities, calls, and offline
support — built as an SPA on Vite + React 19 + TypeScript + Tailwind CSS v4,
with Supabase (DB/Auth/Storage/Realtime), LiveKit (calls), and Netlify (hosting).

## Prerequisites

- **Node 20+** — [nodejs.org](https://nodejs.org)
- **pnpm 9+** — enforced by a `preinstall` hook (`npm` and `yarn` will be rejected)
- **Supabase CLI** — for schema migrations and type generation (installed as a
  dev dependency, or install globally: `npm i -g supabase`)

## Setup

```bash
pnpm install
cp .env.example .env.local   # then fill in real Supabase values
pnpm dev                     # frontend only, strict http://127.0.0.1:5173
pnpm typecheck               # verify zero TypeScript errors
pnpm lint                    # verify zero Biome lint/format errors
```

## Supabase CLI

See [docs/SUPABASE_CLI.md](./docs/SUPABASE_CLI.md) for one-time setup
(`supabase login` + `supabase link`). Quick health check:

```bash
bash scripts/setup-supabase.sh        # Linux / macOS / Git Bash
powershell -File scripts/setup-supabase.ps1   # Windows PowerShell
```

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Start the Vite dev server |
| `pnpm build` | Type-check (`tsc -b`) then production build |
| `pnpm typecheck` | Run the TypeScript project check only |
| `pnpm test` | Run the Node unit test suites |
| `pnpm lint` | Biome check (lint + format) |
| `pnpm db:types` | Regenerate `src/types/database.ts` from the linked remote schema |
| `pnpm test:db --all` | Run every SQL suite in CI (local Supabase + `psql`) |
| `pnpm test:db --staging supabase/tests/<suite>.sql` | Run one rollback-safe SQL suite against Staging |

The Supabase CLI is a dev dependency: invoke it as `pnpm exec supabase` (never assume a global binary).

## Roadmap

This project is built incrementally through **16 spec prompts** that live in
[`.roadmap/`](./.roadmap) (`01-foundations.md` → `16-deployment-metadata.md`).
Each implementation session follows one prompt file, in roadmap order.

## Profile and settings

Prompt 06 adds profile/avatar editing, account and device settings, privacy,
appearance, in-app notification preferences and account-deletion scheduling.
See [deployment and verification instructions](docs/profile-settings.md) before
releasing: migrations **0005–0006**, private Storage buckets, single-confirmation
email settings and the Netlify scheduled function must be configured together.
Run `pnpm test:auth` and `pnpm test:settings` alongside build and lint.

## Chats list

Prompt 07 adds the active chat list, seven filters, local search, message
requests, realtime unread/receipt updates, drafts, selection and touch actions.
Apply **migration 0007 after 0001–0006 before deploying the frontend**. See the
[chat-list deployment notes and verification checklist](docs/chats-list.md).
Run `pnpm test:chats` alongside the existing checks.

## Chat conversations

Prompt 08a adds message history, all nine message renderers, optimistic sends,
drafts, mentions, emoji, private attachments and media viewing. Apply **migration
0008 after 0001–0007** before releasing the frontend. See the
[conversation deployment notes and verification checklist](docs/messages.md).
Run `pnpm test:messages` alongside the existing checks. New chat/group creation
is implemented at `/chats/new` and `/chats/new-group`; see the
[chat-list notes](docs/chats-list.md) and
[new chat/group verification](docs/new-chat-flow.md).

## Message actions and voice notes

Prompt 08b adds replies, reactions, editing, deletion, forwarding, local search,
pinned messages, and voice notes with exclusive playback. Apply **migration 0010
after 0001–0009** before deploying. See the [deployment notes and checklist](docs/message-actions.md).
Run `pnpm test:message-actions` alongside the existing checks. No extra library
is required; voice waveforms use SVG and native audio.

## Contact profiles and chat settings

Prompt 09 adds contact modals, chat menus, group administration, reporting,
shared media/files, and personal clear-chat. Apply **migration 0011 after
0001–0010** manually in the SQL Editor before deploying this frontend. See the
[deployment notes and manual checklist](docs/chat-settings.md). Run
`pnpm test:chat-settings` alongside the existing checks. Voice and video calls
are implemented under Prompt 12 and merged to `main` (see below). No new
dependencies are required for Prompt 09.

### Novedades (Prompt 10)

Stories and broadcast Channels are implemented and merged to `main`. Migrations
`0012` and `0013` are applied and catalog-verified on Staging and Production
(`EVID-011`); the live UI checklist is still pending (`AWAITING_VERIFICATION` in
`.pif/state.md`). See [implementation/deployment notes](docs/novedades.md) and the
[historical implementation status](docs/novedades-implementation-status.md). Do
not rewrite applied migrations.

## Communities (Prompt 11)

Communities with hierarchical child chats, ownership succession and moderation
roles are implemented and merged to `main`. Migration `0014` is catalog-verified
on Staging and Production; live multi-user acceptance and the deferred Prompt 09
checks remain pending (`AWAITING_VERIFICATION`). See
[implementation notes](docs/communities.md) and `.pif/state.md`.

## Calls (Prompt 12)

Voice and video calls use a LiveKit token Edge Function, a call state machine and
in-app call UI, merged via PR `#46` with follow-ups `#67`, `#71` and `#81`. The
delivery and `G4` claims remain `REPORTED` (`AWAITING_VERIFICATION`); see
`.pif/roadmap.md`.

## PWA, offline & push (Prompt 13, adapted)

An installable PWA with Workbox offline caching, an IndexedDB read cache, an
offline outbox and Web Push (`send-push`) is merged via PR `#82`. Acceptance
through `a8bc376` is recorded (`CHG-007`); the post-`a8bc376` delta and the
Production push rollout are `AWAITING_VERIFICATION` (`REPORTED`). See
`.pif/state.md` and `.pif/roadmap.md`.

The authoritative status for every prompt is in [`.pif/state.md`](.pif/state.md)
and [`.pif/roadmap.md`](.pif/roadmap.md); the sections above are summaries, not
acceptance records.

## PIF governance

SilverChat uses the Project Intelligence Framework (PIF). Shared Memory is
governed by [`SHARED_MEMORY_PROTOCOL.md`](./SHARED_MEMORY_PROTOCOL.md), with
canonical records in [`.pif/`](./.pif/) and current status in
[`.pif/state.md`](./.pif/state.md). PIF mode is opt-in: agents follow
[`pif-engineer.init.md`](./.agents/workflows/pif-engineer.init.md) or
[`pif-guardian.init.md`](./.agents/workflows/pif-guardian.init.md) only when the Product Owner explicitly
initializes that role. Engineer proposals go to `.pif/inbox/`; Guardian owns the
canonical records. A reported result is not a verified result until independently
audited.
