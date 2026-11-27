# Project Baseline

- **Project ID:** SilverChat
- **Project Name:** SilverChat
- **Status:** APPROVED — INITIAL GOVERNANCE BASELINE (`2026-11-10`)
- **Baseline revision:** `fceb0e51750eb06ee9f6f18652f7c43f18d11585`

## Problem and purpose

SilverChat is a privacy-first real-time messaging web application (`SPA`) with a futuristic silver + electric-blue design language, offering direct chats, group chats, message requests, 24-hour stories, broadcast channels, hierarchical communities, voice/video calls, and offline/PWA capabilities (`README.md`, `.roadmap/01-foundations.md`).

## Goals

- **GOAL-001 (`USER_APPROVED` baseline objective — `.roadmap/01-foundations.md`, `README.md`):** Deliver a privacy-first messaging web application with strict PostgreSQL Row Level Security (`RLS`), AAL2 MFA enforcement, column-level privacy (`profiles_visible`), and short-lived signed Storage URLs.
- **GOAL-002 (`USER_APPROVED` baseline objective — `.roadmap/01-foundations.md`):** Operate at `$0/month` during the MVP phase (Supabase, LiveKit Cloud, Resend, Netlify free tiers) while preserving a billing-only upgrade path from `~3` to `~10,000` concurrent users without backend or frontend rewrites.
- **GOAL-003 (`USER_APPROVED` baseline objective — `.roadmap/03-design-system.md`, `UI_MIGRATION_MAP.md`):** Maintain a cohesive silver + electric-blue OKLCH theme and glassmorphism UI across desktop and mobile without breaking SPA routing, BFF auth, or Supabase data contracts.

## Scope

**In (`USER_APPROVED` governance baseline from `.roadmap/01-foundations.md` → `.roadmap/16-deployment-metadata.md` & `UI_MIGRATION_MAP.md`):**
- Incremental specification milestones Prompts `#1`–`#16` (`.roadmap/01-foundations.md` through `.roadmap/16-deployment-metadata.md`).
- Phased UI Foundation and Visual Transplant Modules `1`–`6A` (`UI_MIGRATION_MAP.md`, `docs/ui-foundation.md`, `docs/ui-module-6a.md`).
- Resilience and operational hardening (`docs/query-storm-fix.md`, `docs/story-media-burst-fix.md`, `docs/FASE-2.md`).

**Out (Documented Exclusions):**
- Native mobile binaries (iOS/Android); delivered as a responsive web SPA / PWA (`.roadmap/02-stack-setup.md`, `.roadmap/13-pwa-offline.md`).
- Password, phone/SMS, or OAuth social login (`magic-link` + TOTP AAL2 + backup codes only per `.roadmap/05-authentication.md` and `docs/authentication.md`).
- SSR/Vinxi/`@tanstack/react-start` runtime migration (`UI_MIGRATION_MAP.md`).
- Multi-million-user distributed backend re-architecture during MVP (`.roadmap/01-foundations.md`).

## Constraints and non-goals

- **CON-001 (Locked Infrastructure Stack):** Supabase (Postgres, Auth, Storage, Realtime, Edge Functions), LiveKit Cloud, Resend SMTP, and Netlify (Hosting + Auth BFF functions) per `.roadmap/01-foundations.md`.
- **CON-002 (Frontend Stack & Tooling):** Node `20+`, `pnpm 9+` (enforced via `preinstall`), Vite 6, React 19, TypeScript strict, Tailwind CSS v4 OKLCH, TanStack Router & Query, Zustand, Biome (`README.md`, `.roadmap/02-stack-setup.md`).
- **CON-003 (Data Portability & Security Boundary):** Standard PostgreSQL schema compatible with `pg_dump`; no `service_role` keys exposed in client `VITE_*` variables; refresh tokens confined to `HttpOnly` BFF cookies; actual secrets stored only in gitignored `.env` / `.env.local` files (`.roadmap/01-foundations.md`, `docs/authentication.md`, `EVID-010`).
- **CON-004 (Brownfield Continuity & Out-of-Sequence Roadmap Progress):** SilverChat was developed prior to PIF introduction. Features implemented earlier than their numbered roadmap sequence (including `en`/`es` localization, theme persistence, Magic Link + 2FA authentication, RLS, device management, and account deletion affecting Prompts `14` and `15`) are preserved as intentional historical progress rather than defects. Completed functionality does not require re-implementation or blanket re-testing merely because PIF was introduced or because its original roadmap number occurs later; however, historical implementations are not retroactively marked `ACCEPTED` without explicit Product Owner acceptance.

## Definition of Success

- Applicable roadmap milestones implemented and verified against their specification acceptance criteria without regressions in existing suites.
- Database migrations (`supabase/migrations/0001..0014+`) deterministically tracked and aligned across local, staging, and production environments.
- Zero exposed secrets or unauthorized bypasses of RLS/AAL2 security gates.
- Explicit Product Owner acceptance recorded for completed milestones and release readiness.

## Approvals

- **2026-11-10 (`USER_APPROVED` — Initial Reconciliation Authorization, `CHG-001`):** Product Owner authorized governance-only baseline reconciliation at revision `fceb0e51750eb06ee9f6f18652f7c43f18d11585`, English (`en`) documentation language, and non-retroactive `ACCEPTED` classification rule.
- **2026-11-10 (`USER_APPROVED` — Final Governance Baseline Approval, `CHG-002`):** Product Owner approved the reconciled `.pif/` records as SilverChat's initial `APPROVED` governance baseline (`fceb0e51750eb06ee9f6f18652f7c43f18d11585`), subject to explicit scope boundaries: this approval covers the accuracy, structure, and use of the governance baseline reference only, and does **not** constitute retrospective acceptance of historical feature implementations, independent verification of historical test results, production readiness approval, or authorization to deploy or modify application code.
- **2026-11-11 (`USER_APPROVED` — `TASK-012` Acceptance, `CHG-004`):** Product Owner approved and accepted `TASK-012` (Supabase Migration Reconciliation) following PIF Guardian independent audit `PASS` verdict (`EVID-011`), closing `RISK-001`.
- **2026-11-27 (`USER_APPROVED` — `TASK-014` Acceptance through `a8bc376`, `CHG-007`):** Product Owner approved and accepted `TASK-014` (PWA, Offline & Web Push, adapted) after PIF Guardian audits recorded `G0`–`G3` `PASS` (`AUD-014`, `AUD-014-IMP`, `AUD-014-G3`, `AUD-014-F6`; `EVID-012`, `EVID-013`) and confirmed all eight `G4` checks plus the deferred-minors re-confirmation. Acceptance covers `feature/pwa-offline` up to `a8bc376` (`02c6070` delivery) and the approved deviations in `ADR-001`; it does **not** cover the subsequent post-`a8bc376` delta (`c36ccdc`, `4ad2372`, Production push rollout, PR `#82` @ `8105aa9`), CI `G5`, Production release, or `G6`.
- **2026-11-27 (`USER_APPROVED` — Documentary Governance Reconciliation & Protocol Clarifications, `CHG-008`):** Product Owner approved integrating the preserved artifacts from `governance/pwa-offline-g1-brief` (`a474d10`), reconciling canonical `.pif/` records to `main` `HEAD` `6aed855` (`EVID-014`) under conservative `AWAITING_VERIFICATION` (`REPORTED`) classification for un-audited post-baseline work (`TASK-013`, `CHG-006`, and the post-`a8bc376` `TASK-014` delta), and adding four operational clarifications to `SHARED_MEMORY_PROTOCOL.md`. This approval is limited to governance record accuracy and protocol clarity; it does **not** constitute retrospective feature acceptance, technical verification, or authorization to push, open a PR, merge, or deploy.
