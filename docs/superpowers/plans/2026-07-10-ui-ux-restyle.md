# UI/UX Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's single hardcoded dark-cyan theme with two first-class, user-toggleable themes — **Clarity** (light, indigo accent) and **Neutral** (dark, grayscale accent) — driven entirely by the existing shadcn CSS-variable token system, across every page including the fleet/map/digital-twin UI built since this spec was first written.

**Architecture:** Two token edits in `apps/web/app/globals.css` (light mode's `--primary` becomes indigo; dark mode's `--sidebar-primary` stops being an off-palette blue leftover and matches `--primary`'s grayscale). `next-themes` wraps the root layout and drives the `.dark` class instead of it being hardcoded. Every component gets its hardcoded `text-white`/`text-cyan-*` classes replaced with token-based equivalents (`text-foreground`/`text-primary`) — `text-white` is the most load-bearing fix, since it renders invisible on light mode's white background today.

**Tech Stack:** `next-themes` (new dependency), existing Tailwind v4 + shadcn CSS-variable tokens, `lucide-react` (`Sun`/`Moon` icons, already a dependency).

## Global Constraints

- Two substitution rules apply throughout, and ONLY these two — do not invent additional token conversions:
  1. `text-white` → `text-foreground` (critical: white text is invisible on Clarity's white background)
  2. `text-cyan-400`/`text-cyan-500`/`bg-cyan-400/10`/`bg-cyan-500/10`/`bg-cyan-500`/`border-cyan-400/20`/`border-cyan-500/20`/`fill-cyan-400/*`/`hover:bg-cyan-600`/`focus-visible:ring-cyan-500/50`/inline `color: "#22d3ee"` → the corresponding `--primary`-token class (`text-primary`, `bg-primary/10`, `bg-primary`, `border-primary/20`, `fill-primary/*`, `hover:bg-primary/90`, `focus-visible:ring-ring`) — this is the app's ONE brand accent, per the spec.
- **Do NOT touch status/semantic colors**: `rose-400`/`rose-500` (errors/danger), `emerald-400` (success/online-pulse), `amber-400`/`amber-500` (warnings/AI-suggested), `blue-400` (info badges like the "org:" identity badge). These already render correctly on both themes (mid-saturation colors, not white/black) and the spec explicitly keeps them separate from the brand accent.
- **Do NOT touch the homepage's per-module category colors** (`app/page.tsx`'s `MODULES` array `colorClass` strings — cyan/blue/emerald/amber icon+badge combos distinguishing Map/Board/Chat/Hub). These are categorical differentiators, not the brand accent, and changing them would be a design/IA change the spec's Non-goals rule out. The homepage's uniform hover/wordmark/badge cyan (used identically regardless of which module) DOES convert — see Task 3's exact edits for the line-by-line distinction.
- **Do NOT touch `VehicleDigitalTwin.tsx`'s `TONE_COLORS` hex values or `MapCanvas.tsx`'s marker `TONE_COLORS`** — these are health-status indicator colors (green/amber/red), not brand accents, already correctly separated per the earlier digital-twin/map specs' own honesty rules. The geofence circle's color and the "More details" popup link color in `MapCanvas.tsx` ARE brand-accent usages (arbitrary cyan choices, not status-driven) and DO convert to `--primary` — see Task 5.
- No change to corner radius, font family, page structure, navigation model, or component composition (per the original spec's Non-goals).
- Existing component tests must continue passing unchanged after every task.

---

### Task 1: Theme tokens + `next-themes` wiring

**Files:**
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/app/layout.tsx`
- Create: `apps/web/components/theme-toggle.tsx`
- Modify: `apps/web/package.json` (add `next-themes`)

**Interfaces:**
- Produces: light mode's `--primary`/`--primary-foreground`/`--ring`/`--sidebar-primary`/`--sidebar-primary-foreground`/`--sidebar-ring` set to indigo; dark mode's `--sidebar-primary`/`--sidebar-primary-foreground` fixed to match `--primary`'s existing grayscale (currently an off-palette blue leftover). A `ThemeProvider` wrapping the app and a toggle button in the sidebar footer. Every later task's `text-primary`/`bg-primary/*` classes resolve correctly once this lands.

- [ ] **Step 1: Add the dependency**

Add `"next-themes": "^0.4.4"` to `apps/web/package.json`'s `dependencies`. Run `pnpm install` from the repo root; expect exit 0.

- [ ] **Step 2: Edit the light-mode (`:root`) token block**

In `apps/web/app/globals.css`, within the `:root { ... }` block, replace these five lines:

```css
    --primary: oklch(0.205 0 0);
    --primary-foreground: oklch(0.985 0 0);
```

with:

```css
    --primary: oklch(0.511 0.262 276.966);
    --primary-foreground: oklch(0.985 0 0);
```

and replace:

```css
    --ring: oklch(0.708 0 0);
```

with:

```css
    --ring: oklch(0.511 0.262 276.966);
```

and replace:

```css
    --sidebar-primary: oklch(0.205 0 0);
    --sidebar-primary-foreground: oklch(0.985 0 0);
    --sidebar-accent: oklch(0.97 0 0);
    --sidebar-accent-foreground: oklch(0.205 0 0);
    --sidebar-border: oklch(0.922 0 0);
    --sidebar-ring: oklch(0.708 0 0);
```

with:

```css
    --sidebar-primary: oklch(0.511 0.262 276.966);
    --sidebar-primary-foreground: oklch(0.985 0 0);
    --sidebar-accent: oklch(0.97 0 0);
    --sidebar-accent-foreground: oklch(0.205 0 0);
    --sidebar-border: oklch(0.922 0 0);
    --sidebar-ring: oklch(0.511 0.262 276.966);
```

- [ ] **Step 3: Fix the dark-mode `--sidebar-primary` leftover**

In the `.dark { ... }` block, replace:

```css
    --sidebar-primary: oklch(0.488 0.243 264.376);
    --sidebar-primary-foreground: oklch(0.985 0 0);
```

with:

```css
    --sidebar-primary: oklch(0.922 0 0);
    --sidebar-primary-foreground: oklch(0.205 0 0);
```

(This matches `.dark`'s existing `--primary`/`--primary-foreground` values exactly — grayscale, no color, per the spec's "Neutral dark stays grayscale" rule. Every other `.dark` value is left untouched; it was already correct.)

- [ ] **Step 4: Create the theme toggle as its own client component**

`apps/web/app/layout.tsx` is an async Server Component (it calls `getSession()`, which uses `next/headers`) — a `"use client"` directive can only apply to a whole file, so the toggle (which needs `useTheme()`, a client hook) must live in its own file, not be nested inside `layout.tsx`.

Create `apps/web/components/theme-toggle.tsx`:

```tsx
"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
      className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
    >
      {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}
```

- [ ] **Step 5: Wrap the app in `ThemeProvider` and wire in the toggle**

In `apps/web/app/layout.tsx`, add the imports:

```typescript
import { ThemeProvider } from "next-themes";
import { ThemeToggle } from "@/components/theme-toggle";
```

Change the `<html>` tag's `className` from `cn("font-sans dark", geist.variable)` to `cn("font-sans", geist.variable)` (remove the hardcoded `dark` — `next-themes` now controls this) and add `suppressHydrationWarning` to `<html>` (required by `next-themes` since it sets the class after the initial server render):

```tsx
    <html lang="en" className={cn("font-sans", geist.variable)} suppressHydrationWarning>
```

Wrap the existing `<body>...</body>` contents in `<ThemeProvider attribute="class" defaultTheme="dark">...</ThemeProvider>`, i.e. change:

```tsx
      <body className="bg-background text-foreground antialiased min-h-screen">
        <div className="flex min-h-screen">
```

to:

```tsx
      <body className="bg-background text-foreground antialiased min-h-screen">
        <ThemeProvider attribute="class" defaultTheme="dark">
        <div className="flex min-h-screen">
```

and change the closing tags at the end of the file from:

```tsx
        </div>
      </body>
    </html>
```

to:

```tsx
        </div>
        </ThemeProvider>
      </body>
    </html>
```

Add the toggle in the sidebar footer, directly above the existing session block. Replace:

```tsx
            <div className="p-4 border-t border-border mt-auto bg-muted/30">
              {session ? (
```

with:

```tsx
            <div className="p-4 border-t border-border mt-auto bg-muted/30 space-y-3">
              <ThemeToggle />
              {session ? (
```

- [ ] **Step 6: Verify the build**

Run: `pnpm --filter web build`
Expected: succeeds. (`next-themes`'s `ThemeProvider`/`useTheme` are client-safe in a server-rendered layout; `suppressHydrationWarning` prevents the expected one-frame class mismatch from being flagged as an error.)

- [ ] **Step 7: Run the existing web test suite**

Run: `cd apps/web && npx vitest run`
Expected: all existing tests still pass (none of them assert on the literal `dark` class or exact oklch values).

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/globals.css apps/web/app/layout.tsx apps/web/components/theme-toggle.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): add next-themes, indigo Clarity light primary, fix dark sidebar-primary leftover"
```

---

### Task 2: `Badge.tsx` token-based tone colors

**Files:**
- Modify: `packages/ui/src/Badge.tsx`

**Interfaces:**
- Produces: `Badge`'s `neutral` tone renders correctly on both themes. No prop/signature change — every existing `<Badge tone="...">` call site across the app is unaffected.

- [ ] **Step 1: Replace the `neutral` tone's hardcoded colors**

In `packages/ui/src/Badge.tsx`, replace:

```typescript
  neutral: { 
    background: "rgba(255, 255, 255, 0.05)", 
    color: "var(--muted-foreground, #9ca3af)", 
    borderColor: "var(--border, rgba(255,255,255,0.08))" 
  },
```

with:

```typescript
  neutral: { 
    background: "var(--muted)", 
    color: "var(--muted-foreground)", 
    borderColor: "var(--border)" 
  },
```

(The other four tones — `success`/`warning`/`danger`/`info` — already use mid-saturation `rgba()` status colors that render fine on both themes per the Global Constraints; leave them unchanged.)

- [ ] **Step 2: Run the package test suite**

Run: `pnpm --filter @gamopls/ui test`
Expected: existing tests pass (they assert on `data-tone` attributes and children, not literal color values).

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/Badge.tsx
git commit -m "fix(ui): Badge neutral tone uses theme tokens instead of a dark-only rgba"
```

---

### Task 3: Shell + homepage

**Files:**
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: `--primary` token (Task 1).

- [ ] **Step 1: Fix `layout.tsx`'s remaining brand-cyan usages**

In `apps/web/app/layout.tsx`, replace:

```tsx
              <Zap className="h-6 w-6 text-cyan-400 fill-cyan-400/20" />
              <Link href="/" className="font-bold text-lg tracking-tight text-foreground hover:opacity-90">
                GAMOPLS <span className="text-cyan-400">TeamCore</span>
```

with:

```tsx
              <Zap className="h-6 w-6 text-primary fill-primary/20" />
              <Link href="/" className="font-bold text-lg tracking-tight text-foreground hover:opacity-90">
                GAMOPLS <span className="text-primary">TeamCore</span>
```

- [ ] **Step 2: Fix `page.tsx`'s uniform brand-cyan usages (not the per-module colors)**

In `apps/web/app/page.tsx`, replace the hero badge:

```tsx
          <div className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-400 border border-cyan-400/20">
            <ShieldCheck className="h-3.5 w-3.5" />
            Active Fleet Operation Shield
          </div>
```

with:

```tsx
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary border border-primary/20">
            <ShieldCheck className="h-3.5 w-3.5" />
            Active Fleet Operation Shield
          </div>
```

Replace the hero heading and section heading `text-white`:

```tsx
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
```

with:

```tsx
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
```

and:

```tsx
          <h2 className="text-2xl font-bold tracking-tight text-white">Operational Modules</h2>
```

with:

```tsx
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Operational Modules</h2>
```

Replace the card title's uniform hover accent (this hover color is identical across all four cards regardless of module, so it's a brand usage, not a category color — leave the `mod.colorClass`-driven icon/badge colors on the lines above and below this one untouched):

```tsx
                    <CardTitle className="text-lg font-bold text-white group-hover:text-cyan-400 transition-colors">
```

with:

```tsx
                    <CardTitle className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
```

Replace the "Open Module" arrow link color:

```tsx
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400 mt-6 opacity-80 group-hover:opacity-100 transition-opacity">
```

with:

```tsx
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-primary mt-6 opacity-80 group-hover:opacity-100 transition-opacity">
```

Do NOT change the `MODULES` array's four `colorClass` strings (`"text-cyan-400 border-cyan-500/20 bg-cyan-500/5"`, `"text-blue-400 ..."`, `"text-emerald-400 ..."`, `"text-amber-400 ..."`) — these are the per-module category colors, out of scope per Global Constraints.

- [ ] **Step 2: Run the web test suite**

Run: `cd apps/web && npx vitest run`
Expected: all tests pass (neither `layout.tsx` nor `page.tsx` has dedicated component tests today, so this is a regression check on the rest of the suite).

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/layout.tsx apps/web/app/page.tsx
git commit -m "fix(web): token-based colors in shell and homepage"
```

---

### Task 4: Login page

**Files:**
- Modify: `apps/web/app/login/page.tsx`

**Interfaces:**
- Consumes: `--primary` token (Task 1).

- [ ] **Step 1: Fix the icon badge, heading, focus rings, and submit button**

In `apps/web/app/login/page.tsx`, replace:

```tsx
            <div className="p-3 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Zap className="h-8 w-8 fill-cyan-400/10 animate-pulse" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-white tracking-tight">
```

with:

```tsx
            <div className="p-3 rounded-full bg-primary/10 border border-primary/20 text-primary">
              <Zap className="h-8 w-8 fill-primary/10 animate-pulse" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-foreground tracking-tight">
```

Replace both occurrences of `focus-visible:ring-cyan-500/50` (in the username and password `Input` `className` props) with `focus-visible:ring-ring`.

Replace:

```tsx
              className="w-full flex items-center justify-center h-10 px-4 rounded-lg bg-cyan-500 text-white font-semibold text-sm hover:bg-cyan-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
```

with:

```tsx
              className="w-full flex items-center justify-center h-10 px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
```

(Leave the `text-rose-400` error banner unchanged — status color.)

- [ ] **Step 2: Run the web test suite**

Run: `cd apps/web && npx vitest run`
Expected: all pass (login has no dedicated test file; regression check).

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/login/page.tsx
git commit -m "fix(web): token-based colors on the login page"
```

---

### Task 5: Map view group

**Files:**
- Modify: `apps/web/components/map/MapView.tsx`
- Modify: `apps/web/components/map/GeofencePanel.tsx`
- Modify: `apps/web/components/map/MapCanvas.tsx`

**Interfaces:**
- Consumes: `--primary` token (Task 1). `AssetPositionsTable.tsx` needs no change — already clean.

- [ ] **Step 1: Fix `MapView.tsx`**

Replace every `text-white` occurrence in `apps/web/components/map/MapView.tsx`'s two `<h1>`/`<h2>` headings:

```tsx
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              Map
            </h1>
```

→

```tsx
            <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
              Map
            </h1>
```

and:

```tsx
        <h2 className="text-lg font-bold text-white mb-4 border-b border-border/50 pb-2">Active Asset Feed</h2>
```

→

```tsx
        <h2 className="text-lg font-bold text-foreground mb-4 border-b border-border/50 pb-2">Active Asset Feed</h2>
```

- [ ] **Step 2: Fix `GeofencePanel.tsx`**

Replace:

```tsx
      <h2 className="text-lg font-bold text-white mb-4 border-b border-border/50 pb-2">Geofence Boundaries</h2>
```

with `text-foreground`. Replace the two `<span className="font-semibold text-white">` occurrences (the geofence name in the form's label headers is NOT present — only the `DataTable`'s `name` column render, one occurrence: `<span className="font-semibold text-white">{row.name}</span>`) with `text-foreground`.

- [ ] **Step 3: Fix `MapCanvas.tsx`**

Replace the "More details" link's inline hex color:

```tsx
              <Link href={`/fleet/vehicles/${marker.id}`} style={{ fontSize: "0.75rem", color: "#22d3ee", display: "inline-block", marginTop: "0.4rem" }}>
```

with:

```tsx
              <Link href={`/fleet/vehicles/${marker.id}`} style={{ fontSize: "0.75rem", color: "var(--primary)", display: "inline-block", marginTop: "0.4rem" }}>
```

Do NOT change the `TONE_COLORS` object (health-status marker colors) or the geofence `Circle`'s `pathOptions={{ color: "#22d3ee", ... }}` — actually, the geofence circle color IS a brand-accent choice (not a status color — geofences aren't health-toned), so replace it too:

```tsx
          pathOptions={{ color: "#22d3ee", fillOpacity: 0.1 }}
```

with:

```tsx
          pathOptions={{ color: "var(--primary)", fillOpacity: 0.1 }}
```

- [ ] **Step 4: Run the map component test suite**

Run: `cd apps/web && npx vitest run components/map`
Expected: all pass (`MapView.test.tsx`, `MapCanvas.test.tsx`, `AssetPositionsTable.test.tsx`, `api.test.ts` — none assert on literal color values).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/map
git commit -m "fix(web): token-based colors in the map view group"
```

---

### Task 6: Chat view group

**Files:**
- Modify: `apps/web/components/chat/ChatView.tsx`
- Modify: `apps/web/components/chat/ChannelList.tsx`
- Modify: `apps/web/components/chat/MessageList.tsx`
- Modify: `apps/web/components/chat/NewChannelForm.tsx`

**Interfaces:**
- Consumes: `--primary` token (Task 1). `MessageComposer.tsx` needs no change — already clean.

- [ ] **Step 1: Fix `ChatView.tsx`**

Replace:

```tsx
          <h2 className="text-xs font-bold text-white mb-3 uppercase tracking-wider text-muted-foreground">
```

with `text-foreground` in place of `text-white` (keep the rest of the class string as-is, including the redundant-but-pre-existing `text-muted-foreground`).

- [ ] **Step 2: Fix `ChannelList.tsx`**

Replace the selected-channel button's classes:

```tsx
                  ? "bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-semibold" 
```

with:

```tsx
                  ? "bg-primary/10 border border-primary/20 text-primary font-semibold" 
```

Replace:

```tsx
              <Hash className={`h-4 w-4 shrink-0 ${isSelected ? "text-cyan-400" : "text-muted-foreground/60"}`} />
```

with `isSelected ? "text-primary" : ...`, and:

```tsx
                <div className={`text-[10px] ${isSelected ? "text-cyan-400/80" : "text-muted-foreground/60"}`}>
```

with `isSelected ? "text-primary/80" : ...`.

- [ ] **Step 3: Fix `MessageList.tsx`**

Replace:

```tsx
                <span className={`font-semibold text-xs ${isSystem ? "text-rose-400" : "text-white"}`}>
```

with `isSystem ? "text-rose-400" : "text-foreground"` (keep `text-rose-400` for system messages — status color, unchanged). Replace:

```tsx
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
```

with:

```tsx
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
```

- [ ] **Step 4: Fix `NewChannelForm.tsx`**

Replace:

```tsx
      <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-1.5">
        <Plus className="h-4 w-4 text-cyan-400" />
```

with `text-foreground` and `text-primary` respectively.

- [ ] **Step 5: Run the chat component test suite**

Run: `cd apps/web && npx vitest run components/chat`
Expected: all pass (`ChatView.test.tsx`, `MessageList.test.tsx`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/chat
git commit -m "fix(web): token-based colors in the chat view group"
```

---

### Task 7: Board view group

**Files:**
- Modify: `apps/web/components/board/BoardView.tsx`
- Modify: `apps/web/components/board/MissionForm.tsx`
- Modify: `apps/web/components/board/TaskForm.tsx`
- Modify: `apps/web/components/board/TaskCard.tsx`

**Interfaces:**
- Consumes: `--primary` token (Task 1).

- [ ] **Step 1: Fix `BoardView.tsx`**

Replace every `text-white` occurrence: the error-state heading `<h2 className="text-xl font-bold text-white">Board</h2>`, the two headings `<h1 className="text-2xl font-bold text-white tracking-tight ...">`/`<h2 className="text-lg font-bold text-white ...">Missions</h2>`/`<h2 className="text-lg font-bold text-white ...">Tasks</h2>` — each becomes `text-foreground` in place of `text-white`, keeping every other class unchanged. Replace the mission-name `<span className="font-semibold text-sm text-white">{mission.title}</span>` similarly.

- [ ] **Step 2: Fix `MissionForm.tsx`**

Replace:

```tsx
      <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-1.5">
        <Plus className="h-4 w-4 text-cyan-400" />
```

with `text-foreground` and `text-primary`.

- [ ] **Step 3: Fix `TaskForm.tsx`**

Replace:

```tsx
      <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-1.5">
        <Plus className="h-4 w-4 text-cyan-400" />
```

with `text-foreground` and `text-primary` (same pattern as `MissionForm.tsx`).

- [ ] **Step 4: Fix `TaskCard.tsx`**

Replace the task title `<h4 className="font-bold text-white text-base leading-snug">{task.title}</h4>` and the two `<span className="text-white font-medium">`/`<span className="text-white font-mono">` occurrences in the mission-scope/assigned-machine grid — all three become `text-foreground` in place of `text-white`. (Leave the `Badge tone="warning"` "AI Suggested" badge and `STATUS_TONE` map untouched — status colors, already token-driven via `Badge`.)

- [ ] **Step 5: Run the board component test suite**

Run: `cd apps/web && npx vitest run components/board`
Expected: all pass (`BoardView.test.tsx`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/board
git commit -m "fix(web): token-based colors in the board view group"
```

---

### Task 8: Hub view group

**Files:**
- Modify: `apps/web/components/hub/HubView.tsx`
- Modify: `apps/web/components/hub/SearchPanel.tsx`
- Modify: `apps/web/components/hub/UploadForm.tsx`

**Interfaces:**
- Consumes: `--primary` token (Task 1). `DocumentTable.tsx` needs no change — already clean.

- [ ] **Step 1: Fix `HubView.tsx`**

Replace the error-state heading `<h2 className="text-xl font-bold text-white">Hub Index Failure</h2>`, the page heading `<h1 className="text-2xl font-bold text-white tracking-tight ...">Hub</h1>`, and the documents-card heading `<h2 className="text-lg font-bold text-white mb-4 ...">` — each `text-white` becomes `text-foreground`. Replace:

```tsx
          <Folder className="h-5 w-5 text-cyan-400" />
```

with `text-primary`.

- [ ] **Step 2: Fix `SearchPanel.tsx`**

Replace:

```tsx
      <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-1.5">
        <Search className="h-5 w-5 text-cyan-400" />
```

with `text-foreground` and `text-primary`. Replace `<strong className="text-xs font-bold text-white block">{result.filename}</strong>` with `text-foreground`. Replace `<FileText className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" />` with `text-primary`.

- [ ] **Step 3: Fix `UploadForm.tsx`**

Replace:

```tsx
      <h2 className="text-lg font-bold text-white mb-4 border-b border-border/50 pb-2 flex items-center gap-1.5">
        <UploadCloud className="h-5 w-5 text-cyan-400" />
```

with `text-foreground` and `text-primary`. Replace `<FileIcon className="h-8 w-8 text-cyan-400/80" />` with `text-primary/80`. Replace `<p className="text-xs font-semibold text-white">` (the selected-filename text) with `text-foreground`.

Also fix the one raw inline-style error text that bypasses the theme system entirely — replace:

```tsx
          <p role="alert" style={{ color: "#ef4444", fontSize: "0.875rem", margin: 0 }}>
            {error}
          </p>
```

with:

```tsx
          <p role="alert" className="text-sm text-rose-400">
            {error}
          </p>
```

(matches the `text-rose-400` status-color convention used for errors everywhere else in the app, instead of a raw hex value.)

- [ ] **Step 4: Run the hub component test suite**

Run: `cd apps/web && npx vitest run components/hub`
Expected: all pass (`HubView.test.tsx`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/hub
git commit -m "fix(web): token-based colors in the hub view group"
```

---

### Task 9: Fleet view group (added since the original spec — Phase 8.A–8.D)

**Files:**
- Modify: `apps/web/components/fleet/FleetSwitcher.tsx`
- Modify: `apps/web/components/fleet/AddVehicleForm.tsx`
- Modify: `apps/web/components/fleet/AddDriverForm.tsx`
- Modify: `apps/web/components/fleet/VehiclesPanel.tsx`
- Modify: `apps/web/components/fleet/DriversPanel.tsx`
- Modify: `apps/web/components/fleet/MaintenanceCard.tsx`
- Modify: `apps/web/app/fleet/page.tsx`
- Modify: `apps/web/app/fleet/vehicles/[id]/page.tsx`

**Interfaces:**
- Consumes: `--primary` token (Task 1). `VehiclesTable.tsx` and `DriversTable.tsx` need no change — already clean (Badge-driven or plain `text-foreground`).

- [ ] **Step 1: Fix `FleetSwitcher.tsx`**

Replace:

```tsx
      className="h-7 px-2 rounded-full bg-cyan-400/10 border border-cyan-400/20 text-xs font-medium text-cyan-400"
```

with:

```tsx
      className="h-7 px-2 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary"
```

- [ ] **Step 2: Fix `AddVehicleForm.tsx`**

Replace:

```tsx
      <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-1.5">
        <Plus className="h-4 w-4 text-cyan-400" />
```

with `text-foreground` and `text-primary`. Replace:

```tsx
        className="text-xs font-semibold text-cyan-400 hover:underline"
```

with `text-primary`.

- [ ] **Step 3: Fix `AddDriverForm.tsx`**

Replace:

```tsx
      <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-1.5">
        <Plus className="h-4 w-4 text-cyan-400" />
```

with `text-foreground` and `text-primary` (same pattern as `AddVehicleForm.tsx`).

- [ ] **Step 4: Fix `VehiclesPanel.tsx` and `DriversPanel.tsx`**

In each, replace the single occurrence of:

```tsx
        <h2 className="text-lg font-bold text-white mb-4 border-b border-border/50 pb-2">Vehicles</h2>
```

(and, in `DriversPanel.tsx`, the equivalent `>Drivers</h2>` line) with `text-foreground` in place of `text-white`.

- [ ] **Step 5: Fix `MaintenanceCard.tsx`**

Replace:

```tsx
      <h2 className="text-lg font-bold text-white">Maintenance</h2>
```

with `text-foreground`.

- [ ] **Step 6: Fix `app/fleet/page.tsx`**

Replace:

```tsx
        <h1 className="text-2xl font-bold text-white tracking-tight">Fleet</h1>
```

with `text-foreground`. Replace the tab-underline active state:

```tsx
              tab === t ? "border-cyan-400 text-white" : "border-transparent text-muted-foreground hover:text-foreground"
```

with:

```tsx
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
```

- [ ] **Step 7: Fix `app/fleet/vehicles/[id]/page.tsx`**

Replace the three `text-white` occurrences — the vehicle-name `<h1 className="text-2xl font-bold text-white tracking-tight">{asset.display_label}</h1>`, the "Digital twin" `<h2 className="text-lg font-bold text-white">Digital twin</h2>`, and the "Driver assignment" `<h2 className="text-lg font-bold text-white mb-3">Driver assignment</h2>` — each becomes `text-foreground` in place of `text-white`.

- [ ] **Step 8: Run the fleet component test suite**

Run: `cd apps/web && npx vitest run components/fleet app/fleet`
Expected: all pass (`VehiclesPanel.test.tsx`, `DriversPanel.test.tsx`, `FleetSwitcher.test.tsx`, `MaintenanceCard.test.tsx`, `api.test.ts`, `app/fleet/vehicles/__tests__/page.test.tsx`).

- [ ] **Step 9: Commit**

```bash
git add apps/web/components/fleet apps/web/app/fleet
git commit -m "fix(web): token-based colors in the fleet view group"
```

---

## Post-plan verification

```bash
pnpm build && pnpm lint && pnpm test
```

Then smoke-test manually per this repo's UI-testing convention: `pnpm start:all`, click the new theme toggle in the sidebar footer, confirm every one of the 9 pages (home, login, map, chat, board, hub, fleet, fleet/vehicles/:id, and the fleet vehicles/drivers tabs) renders with no invisible white-on-white or unstyled text in Clarity (light) mode, and that Neutral (dark) mode still looks the same as before this plan (grayscale, no regressions). Confirm the toggle's choice persists across a page reload.
