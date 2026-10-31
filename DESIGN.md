# Design System: Altus Personal Cloud

<!-- impeccable:design-schema 1 -->

## Design Philosophy & Mode

Altus operates in **Operate** mode. Scanability, native expectations, instant feedback, and clean visual hierarchy supersede decorative excess. The interface disappears into the user's workflow, giving immediate access to files, folders, and operations.

- **Theme Strategy:** Subtle surfaces derived from the selected accent (`--color-accent: #3b82f6` by default), with stronger color reserved for actions and selection.
- **Sidebar Tint:** A deeper accent tint distinguishes navigation from the workspace in both light and dark themes. Dark navigation uses a darker base, while content surfaces stay elevated.
- **Iconography:** Exclusively Google Material Symbols Outlined (`.material-symbols-outlined`), drawn in uniform stroke and weight (400, 24px default).
- **Zero Third-Party UI Frameworks:** 100% Vanilla CSS3 with standard CSS Custom Properties and Semantic HTML5.

---

## Typography

- **Font Family:** Single workhorse UI sans stack:
  ```css
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  ```
- **Scale:** Fixed rem scale with tight ratio (~1.125-1.2):
  - `--text-2xs`: `0.6875rem` (11px) - Metadata tags, file extensions badge
  - `--text-xs`: `0.75rem` (12px) - Secondary timestamps, helper labels
  - `--text-sm`: `0.875rem` (14px) - Body UI, list item labels, input fields, buttons
  - `--text-base`: `1rem` (16px) - Section headers, card titles, modal headings
  - `--text-lg`: `1.125rem` (18px) - View titles, breadcrumb root
  - `--text-xl`: `1.25rem` (20px) - Page titles
  - `--text-2xl`: `1.5rem` (24px) - Modal titles, prominent brand
- **Weights:** Regular (400), Medium (500), SemiBold (600).
- **Line Heights:** Tighter for UI labels (`1.2 - 1.4`), regular for prose (`1.5`).

---

## Color Tokens & Palette

### Accent-Tinted Surfaces

The tokens below remain neutral fallbacks. In browsers supporting `color-mix()`, the cloud SPA in `public/themes/altus/assets/css/altus.css` derives opaque surfaces from `--color-accent` using the following sRGB mixes. All eight palettes, including default blue without a saved preference, update immediately through the existing theme and accent attributes.

| Token | Light: accent weight / base | Dark: accent weight / base |
| --- | --- | --- |
| `--color-bg-app` | 6% / `#fafbfc` | 6% / `#101114` |
| `--color-bg-surface` | 1.5% / `#ffffff` | 4% / `#191b20` |
| `--color-bg-sidebar` | 12% / `#f1f3f5` | 7% / `#090a0d` |
| `--color-bg-subtle` | 4% / `#f8f9fb` | 6% / `#202329` |
| `--color-bg-hover` | 9% / `#f1f3f5` | 10% / `#252830` |
| `--color-bg-active` | 14% / `#e6e9ee` | 14% / `#30343c` |
| `--color-border` | 12% / `#dfe3e9` | 12% / `#2a2e36` |
| `--color-border-subtle` | 8% / `#edf0f4` | 8% / `#202329` |
| `--color-border-hover` | 18% / `#c8cfd9` | 18% / `#3a404a` |

Muted text uses `#4d5b70` in light mode and `#adbacb` in dark mode on these tinted surfaces to preserve readability, including hover and pressed states. Semantic feedback and custom folder colors retain their existing roles.

#### Neutral Fallbacks
- `--color-bg-app`: `#f8fafc` (Slate 50 - Base app backdrop)
- `--color-bg-surface`: `#ffffff` (White - Content cards, modals, table rows)
- `--color-bg-sidebar`: `#f1f5f9` (Slate 100 - Left sidebar & header neutral)
- `--color-bg-subtle`: `#f8fafc` (Slate 50 - Table alternate rows, search input bg)
- `--color-bg-hover`: `#f1f5f9` (Slate 100 - Row/button hover)
- `--color-bg-active`: `#e2e8f0` (Slate 200 - Active selection / pressed state)
- `--color-border`: `#e2e8f0` (Slate 200 - Primary dividers and card borders)
- `--color-border-subtle`: `#f1f5f9` (Slate 100 - Sub-item dividers)

### Foreground & Text
- `--color-text-primary`: `#0f172a` (Slate 900 - High contrast headings, file names)
- `--color-text-secondary`: `#475569` (Slate 600 - File sizes, metadata, labels, >4.5:1 contrast)
- `--color-text-muted`: `#64748b` (Slate 500 - Inactive icons, placeholder text)
- `--color-text-inverse`: `#ffffff` (White on primary buttons)

### Primary Accent & User-Selectable Palettes (`[data-accent]`)
- `--color-accent`: `#3b82f6` (Blue 500 default - Primary buttons, active nav, focus rings)
- `--color-accent-hover`: `#2563eb` (Blue 600 - Accent hover)
- `--color-accent-subtle`: `#eff6ff` (Blue 50 - Selected item background tint)
- `--color-accent-border`: `#93c5fd` (Blue 300 - Selected item border)
- `--color-accent-rgb`: `59, 130, 246` (RGB channels for translucent overlays and elevation glows)
- **Supported Accent Palettes (`localStorage: altus_accent` — aligned with vibrant folder badge colors):**
  - `blue` (Default): `#3b82f6` (Hover `#2563eb`)
  - `indigo`: `#6366f1` (Hover `#4f46e5`)
  - `violet`: `#a855f7` (Hover `#9333ea`)
  - `rose`: `#f43f5e` (Hover `#e11d48`)
  - `orange`: `#f97316` (Hover `#ea580c`)
  - `amber`: `#f59e0b` (Hover `#d97706`)
  - `emerald`: `#22c55e` (Hover `#16a34a`)
  - `teal`: `#14b8a6` (Hover `#0d9488`)

### Semantic Status
- `--color-success`: `#16a34a` / `--color-success-bg`: `#f0fdf4` / `--color-success-border`: `#bbf7d0`
- `--color-warning`: `#d97706` / `--color-warning-bg`: `#fffbeb` / `--color-warning-border`: `#fde68a`
- `--color-danger`: `#dc2626` / `--color-danger-bg`: `#fef2f2` / `--color-danger-border`: `#fecaca`
- `--color-info`: `#0284c7` / `--color-info-bg`: `#f0f9ff` / `--color-info-border`: `#bae6fd`

### Folder Custom Color Badges (PRD 6.2)
- `--folder-red`: `#ef4444` (Classic Rainbow Red)
- `--folder-orange`: `#f97316` (Classic Rainbow Orange)
- `--folder-yellow`: `#eab308` (Classic Rainbow Yellow)
- `--folder-green`: `#22c55e` (Classic Rainbow Green)
- `--folder-blue`: `#3b82f6` (Classic Rainbow Blue)
- `--folder-indigo`: `#6366f1` (Classic Rainbow Indigo)
- `--folder-violet`: `#a855f7` (Classic Rainbow Violet)
- `--folder-slate`: `#64748b` (Default Neutral Slate)

---

## Depth & Elevation

Offsets with soft blurs (avoiding hard neobrutalist block shadows):
- `--shadow-xs`: `0 1px 2px 0 rgba(15, 23, 42, 0.04)`
- `--shadow-sm`: `0 1px 3px 0 rgba(15, 23, 42, 0.06), 0 1px 2px -1px rgba(15, 23, 42, 0.06)`
- `--shadow-md`: `0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.05)`
- `--shadow-lg`: `0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.04)`
- `--shadow-dropdown`: `0 12px 24px -4px rgba(15, 23, 42, 0.12), 0 4px 6px -2px rgba(15, 23, 42, 0.04)`

---

## Spacing Grid (4px / 8px Base)

- `--space-0-5`: `2px`
- `--space-1`: `4px`
- `--space-1-5`: `6px`
- `--space-2`: `8px`
- `--space-3`: `12px`
- `--space-4`: `16px`
- `--space-5`: `20px`
- `--space-6`: `24px`
- `--space-8`: `32px`
- `--space-10`: `40px`
- `--space-12`: `48px`

---

## Radii

- `--radius-xs`: `3px`
- `--radius-sm`: `6px`
- `--radius-md`: `8px`
- `--radius-lg`: `12px`
- `--radius-xl`: `16px`
- `--radius-full`: `9999px`

---

## Motion & Transitions

- Fast 150-200ms cubic-bezier: `--transition-fast`: `150ms cubic-bezier(0.4, 0, 0.2, 1)`
- Drawer transition: `--transition-drawer`: `250ms cubic-bezier(0.16, 1, 0.3, 1)`
- Respects `prefers-reduced-motion: reduce`.
