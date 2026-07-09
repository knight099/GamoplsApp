# UI/UX Restyle — `apps/web` — Design

## Context

V1 backend work (Phases 0–7.4 of `PLAN.md`) is complete. `apps/web` already went through one visual pass in recent commits (Tailwind v4 + shadcn/ui, "premium dark SaaS dashboard") — the sidebar/header shell, homepage, `MapView`, and `BoardView` all use a dark theme with hardcoded cyan/blue/emerald Tailwind utility classes (`text-cyan-400`, `bg-blue-400/10`, etc.) layered on top of the shadcn CSS-variable token system.

**2026-07-10 update:** this spec was written before Phase 8.A–8.D (fleet/vehicle/driver management, the interactive map, the digital twin dashboard, and maintenance/fleet optimization) were built. Those additions — `components/fleet/*`, `components/map/MapCanvas.tsx`, `app/fleet/*` — were built to match the *existing* dark theme and carry the identical hardcoded-color pattern (confirmed via `grep -rl "cyan-400\|blue-400\|emerald-400" components/fleet components/map/MapCanvas.tsx app/fleet`). The design below (themes, tokens, mechanism) is unchanged and still approved — only the **Scope of changes** section is amended to include this newer UI, so the restyle covers the whole app as originally intended rather than leaving the newest third of it out.

This spec replaces that ad-hoc color layer with a deliberate two-theme system (light + dark), selected via the brainstorming skill's visual companion (see `.superpowers/brainstorm/68018-1783610168/content/` for the explored mockups: `visual-direction.html`, `theme-mockup.html`, `typography-radius.html`).

## Goals

- Two first-class themes — **Clarity** (light) and **Neutral** (dark) — user-toggleable, not just "dark with a light fallback."
- Remove hardcoded Tailwind color utilities from components; drive all color through the existing shadcn CSS-variable token system (`--primary`, `--card`, `--border`, etc.) so every view themes correctly automatically.
- Apply consistently across the entire app: shell, homepage, login, and all four module views (Map, Chat, Board, Hub) plus their subcomponents.
- Fix the one shared primitive (`Badge` in `packages/ui`) that hardcodes colors instead of using tokens, since it's reused everywhere and currently assumes a dark background.

## Non-goals

- No change to corner radius (`--radius: 0.625rem` stays) or font family (Geist Sans stays, used uniformly — no mono treatment for numerals).
- No change to page structure/layout, navigation model, or component composition — this is a color/token pass, not an IA redesign.
- No new pages or features.

## Visual system

### Themes

**Clarity (light)** — default `--background`/`--card` near-white (`#f7f8fa`/`#ffffff`), `--foreground` near-black, **`--primary` set to indigo** (`oklch` equivalent of `#4f46e5`) — the one accent color, used for the active nav item, primary buttons, links, and focus rings.

**Neutral (dark)** — default `--background`/`--card` flat near-black (`#18181b`/`#1f1f23`, no navy/blue tint), `--foreground` near-white, **`--primary` stays grayscale** (near-white, current shadcn dark default is already close to this — verify against `#f4f4f5`-equivalent oklch value). No accent color in dark mode; nav/buttons/links use grayscale contrast instead of a color.

Both themes already have their `--background`/`--card`/`--border`/etc. base values roughly in place in `apps/web/app/globals.css` (`:root` and `.dark` blocks) — the only token change needed is setting light mode's `--primary`/`--primary-foreground`/`--ring`/`--sidebar-primary` to the indigo value, and confirming dark mode's equivalents stay grayscale.

### Status colors (unchanged in intent, fixed in implementation)

Green (success/online), amber (warning), red (danger/alert), blue (info) are **separate from `--primary`** in both themes and only appear on: `Badge` tones, live-status dots (e.g., sidebar "Dispatcher Active" indicator), and inline alert/error text. They must render correctly against both light and dark surfaces — today's `Badge` component (`packages/ui/src/Badge.tsx`) hardcodes translucent-white borders/backgrounds for its `neutral` tone that assume a dark background; this needs to switch to token-based colors (e.g., `var(--muted)`/`var(--border)`) so it works on both themes.

### Typography & shape

No change. Geist Sans stays as the sole typeface (no mono treatment). Radius scale (`--radius` and its derived `sm`/`md`/`lg`/`xl` steps in `globals.css`) stays as-is.

## Theming mechanism

- Add `next-themes` as a dependency of `apps/web` (not currently installed).
- Wrap the root layout in a `ThemeProvider` (`attribute="class"`, matching the existing `.dark` selector convention already used in `globals.css`'s `@custom-variant dark`).
- Remove the hardcoded `dark` class from `<html className="font-sans dark">` in `app/layout.tsx` — theme class is now controlled by `next-themes`.
- Default theme: **dark** (`Neutral`), matching current behavior, until the user picks a preference. Preference persists via `next-themes`' built-in `localStorage` handling; no backend/session involvement needed.
- Add a toggle control (sun/moon icon button, likely `lucide-react`'s `Sun`/`Moon`) in the sidebar footer of `app/layout.tsx`, near the session/sign-out block.
- `next-themes` handles the no-FOUC inline script automatically; no custom SSR theme-detection logic needed.

## Scope of changes

Every page and its subcomponents get the token-based color pass — no page is skipped:

- `app/layout.tsx` — sidebar, header, theme toggle
- `app/page.tsx` — homepage hero + module grid
- `app/login/page.tsx`
- `components/map/*` (`MapView`, `AssetPositionsTable`, `GeofencePanel`)
- `components/chat/*` (`ChatView`, `ChannelList`, `MessageList`, `MessageComposer`, `NewChannelForm`)
- `components/board/*` (`BoardView`, `MissionForm`, `TaskForm`, `TaskCard`)
- `components/hub/*` (`HubView`, `DocumentTable`, `SearchPanel`, `UploadForm`)
- `components/fleet/*` (`VehiclesPanel`, `DriversPanel`, `AddVehicleForm`, `AddDriverForm`, `VehiclesTable`, `DriversTable`, `FleetSwitcher`, `MaintenanceCard`, `VehicleDigitalTwin`) — added in Phase 8.A/8.D, same hardcoded-color pattern as the rest of the app
- `components/map/MapCanvas.tsx` — added in Phase 8.B; its health-tone marker colors (green/amber/red dots) are status colors, not theme accents, and stay as-is per this spec's "Status colors" section — only its non-status chrome (popup background/text, "More details" link color) needs the token pass
- `app/fleet/page.tsx`, `app/fleet/vehicles/[id]/page.tsx` — added in Phase 8.A/8.B/8.C/8.D
- `packages/ui/src/Badge.tsx` — token-based tone colors (see above)
- `packages/ui/src/Card.tsx`, `Button.tsx`, `Spinner.tsx` — already token-based (verified during design); no change expected beyond spot-checking they render correctly in light mode, since they were only ever exercised in dark mode until now
- `components/ui/*` (shadcn primitives: `button.tsx`, `card.tsx`, `dialog.tsx`, `input.tsx`, `tabs.tsx`) — spot-check for hardcoded colors, fix if found

The mechanical part of this work — replacing `text-cyan-400`/`bg-blue-400/10`/etc. with token-based Tailwind classes (`text-primary`, `bg-accent`, etc.) or CSS-variable references — is repetitive across ~20 files; the implementation plan should account for that as a per-file pass rather than a single edit.

## Testing

- Existing component tests (`components/*/__tests__/*.test.tsx`) should continue passing unchanged — they test behavior, not visual output.
- Manual verification pass (per this repo's convention of testing UI changes in a real browser): load each of the 8 pages/views in both light and dark mode, confirm no unstyled/invisible text (e.g., white-on-white or black-on-black from a missed hardcoded color), confirm the theme toggle persists across a page reload.
