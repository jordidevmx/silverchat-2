# SilverChat Photo Studio Modal (`AvatarPickerModal`) Redesign

## Intent

Replace the plain utility-stacked `AvatarPickerModal` with a purpose-built SilverChat Photo Studio modal that matches the sleek, modern, futuristic visual language of the redesigned Edit Profile trigger across every entry point (Profile, Group, Community, and Channel photo editing).

## Architecture & Visual Design

- **Self-contained native `<dialog>` (`src/features/settings/components/AvatarPickerModal.tsx`)** paired with a dedicated stylesheet (`src/styles/avatar-picker.css`) imported directly by the modal so styling loads reliably even outside `/settings/*`.
- **Glass Shell:** Frosted obsidian/porcelain glass surface (`inline-size: min(440px, calc(100vw - 24px))`), top ambient `--neon` radial glow, `28px` radius, hairline neon-silver border, blurred backdrop, `overscroll-behavior: contain` on both `:modal` and `::backdrop`, animated enter/exit honoring `prefers-reduced-motion`, Escape + backdrop light-dismiss (with Safari pointer fallback) guarded when busy.
- **Three Studio States:**
  1. **Picker Hub:** Centered `112px` circular live photo preview orb (or metallic glowing placeholder when unset) framed in a concentric neon-silver ring, real drag-and-drop + clipboard paste (`Ctrl+V`) support with live neon drag highlight, 2-column glass action tiles (`Upload photo`, `Take photo`), quiet drag/paste hint, and compact existing-photo action row (`View photo`, `Remove photo`).
  2. **Crop Studio:** Circular `react-easy-crop` lens stage (`.avatar-crop`) framed in a neon hairline border, frosted Zoom Control Deck with `-`/`+` precision buttons and a brand-consistent native `<input type="range">` neon slider (`Zoom` label + tabular readout), plus clean `Discard crop`, `Cancel`, and glowing `Save` actions.
  3. **Lightbox Preview:** Framed full-size `.avatar-preview` showcase with `Back` and `Cancel`.

## Preserved Contracts

- Accessible dialog name `"Change photo"` (`aria-labelledby` pointing at the dialog's `<h1>`), native focus containment and return to invoker on close.
- Exact button names (`Upload photo`, `Take photo`, `View photo`, `Remove photo`, `Discard crop`, `Save`, `Cancel`, `Back`), `Zoom` slider label, `.avatar-crop` class, upload `<input type="file">` first in DOM order, clipboard paste target, and `"Choose an image smaller than 20 MB."` alert message.
- `PhotoEditorPanel.tsx` and inline creation forms remain untouched.
