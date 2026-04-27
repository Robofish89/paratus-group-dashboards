# Style Guide — Paratus Group Dashboards

Mirrors the AMA / AMA Care dashboard design system for visual congruence across all Paratus properties. Source of truth: `packages/ui/src/styles/theme.css` (oklch tokens) and `packages/ui/tailwind.config.ts` (utility classes).

## Brand Colors

| Name | Hex | Token | Usage |
|------|-----|-------|-------|
| Paratus Blue (Primary) | `#2B479B` | `--primary`, `paratus-blue` | Buttons, links, active nav, KPI emphasis |
| Paratus Light Blue (Secondary) | `#3B5FC0` | `--secondary`, `paratus-blue-light` | Sidebar accents, secondary actions |
| Paratus Orange (Accent) | `#F7941D` | `--accent`, `paratus-orange` | Speed-to-lead alerts, CTAs that need attention |
| Sidebar Dark | `#0F172A` | `--sidebar` | Sidebar background |
| Background | `#F8FAFC` | `--background` | App canvas |
| Surface | `#FFFFFF` | `--card` | Cards, modals, table rows (even) |
| Text Primary | `#0F172A` | `--foreground` | Headings, body |
| Text Muted | `#64748B` | `--muted-foreground` | Captions, helper text |
| Border | `#E2E8F0` | `--border` | Dividers |
| Success | emerald-500 | chart-2 / status | Healthy KPIs, "responded < 5min" |
| Warning | amber-500 | accent variant | Pending, "due soon" |
| Destructive | `#EF4444` | `--destructive` | Lost leads, > 47hr response, errors |

## Typography
- Family: **DM Sans** (Google Fonts) — matches the approved mockups in `docs/design-reference/`
- Headings: 600–700, tracking-tight
- Body: 400–500, 14–16px
- Captions / metric labels: 11–12px, uppercase, tracking-wide for kiosk feel

## Spacing
- Base unit: 4px (Tailwind default)
- Page padding: `p-8` (32px) on main canvas, max-width `1280px`
- Card padding: `p-5` to `p-6`
- Section gap: `space-y-6` to `space-y-8`

## Border Radius
- Buttons: `rounded-lg` (`--radius-md`)
- Cards: `rounded-xl` (`--radius-lg` ≈ 0.625rem base)
- Inputs: `rounded-md`
- Pills / status badges: `rounded-full`

## Component Patterns
Use `@repo/ui` components — do not re-create.
- **Layout:** `DashboardLayout` (sidebar + main, AMA pattern, 256px sidebar)
- **KPI:** `MetricCard` with optional trend
- **Charts:** `HorizontalBarChart` (country/agent leaderboards), Recharts for line/area trends
- **Tables:** kiosk striped pattern via `data-slot` rules in theme.css — odd rows `#F1F5F9`, hover `#DBEAFE`
- **Status:** `StatusBadge` + `StatusPipeline` for lead lifecycle (New → Contacted → Qualified → Converted)
- **Cards:** `SectionCard` for grouped panels with title + actions, `CallbackCard` repurposed for sales rep queue

## Assets
- Logo: `apps/web/public/logo.png` (copy from `docs/design-reference/logo.png`)
- Favicon: derived from logo — generate during phase 1
- OG image: TBD (HQ overview screenshot once built)

## References
- Approved mockups: `docs/design-reference/{hq,country-admin,sales-rep}-dashboard.html`
- AMA design system: `~/Projects/ama-amacare-stats-callback-dashboard/packages/ui/`
- Original quote design screens: `docs/design-reference/Screenshot 2026-04-08 *.png`
