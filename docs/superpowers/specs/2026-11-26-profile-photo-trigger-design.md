# Edit Profile Photo Trigger Layout & SilverChat Polish

## Intent & Root Cause

On `/settings/profile` ("Edit profile"), the `"Change photo"` trigger renders as `<Button variant="ghost" className="profile-photo-trigger">` inside `.profile-avatar-editor`. Because `Button`'s default size variant injects Tailwind v4 `@layer utilities` classes (`h-9 px-4 py-2 gap-2 rounded-md`), those utilities unconditionally override `.settings-panel .profile-photo-trigger` (`height: auto; gap: 12px; padding: 16px; border-radius: 24px`) declared in `@layer components` of `src/styles/settings.css`.

As a result, the button box stays locked at `36px` tall (`h-9`). Its `100px` avatar and `"Change photo"` label overflow vertically out of the button, creating a `36px` horizontal hover box behind the center of the avatar and letting `"Change photo"` slide underneath the translucent `.settings-card` form surface below.

## Goals

- Eliminate the CSS cascade clash so the trigger sizes intrinsically to wrap the full `100px` avatar and `"Change photo"` label with clean breathing room above the profile form card.
- Preserve the centered composition while elevating the trigger to match SilverChat's sleek, modern, futuristic visual language:
  - Subtle metallic/glass avatar ring that lights up with `--neon` and `--shadow-glow` on hover and `focus-visible`.
  - Compact frosted circular camera badge anchored to the avatar's bottom-right edge as a clear edit affordance.
  - Clear `"Change photo"` label below the avatar with a soft glass hover surface wrapping the entire trigger.
- Maintain light/dark mode support, all six accent themes, `prefers-reduced-motion`, keyboard focus visibility, and existing accessible name (`button` named `"Change photo"`).

## Non-Goals

- Modifying `src/components/ui/settings-surfaces.tsx`, `AvatarPickerModal`, or the profile form fields.
- Adding extra cards or changing the Edit Profile page hierarchy.

## Approaches Considered

1. **Selected — Root-cause layout fix + SilverChat neon-glass polish:** Resolve the Tailwind cascade clash directly on the trigger and style the avatar frame, camera badge, and hover surface using existing SilverChat CSS tokens (`--neon`, `--shadow-glow`, `--card`, `--border`, `--primary`). Gives both structural correctness and visual cohesion with SilverChat Settings.
2. **Minimal cascade fix only:** Override `h-9` and spacing utilities while keeping the plain unstyled ghost look. Fixes overlap but misses the opportunity to provide a crisp edit affordance matching the rest of Settings.

## Scope & Verification

- Files: `src/routes/settings.profile.tsx`, `src/styles/settings.css`, and `tests/settings-browser.mjs`.
- Verification: TDD red-green geometry regression check in `tests/settings-browser.mjs` across 375/768/1280 widths (verifying button encloses avatar + label, button sits cleanly above `.settings-card` with positive gap and zero overlap), visual screenshot inspection in dark/light mode, Biome lint check, and `tsc -b`.
