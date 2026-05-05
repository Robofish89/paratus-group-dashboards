/**
 * Single source of truth for the public GitHub-blob URL prefix that the
 * in-app `?` help link points to. The role shells append the role-specific
 * markdown filename (e.g. `/docs/onboarding/agent.md`) when wiring
 * `helpHref` on `<DashboardLayout>`.
 *
 * If the repo ever moves owners, change this constant in one place. URLs
 * are public and never rotate, so they live as a compile-time constant
 * rather than an env var (no Vercel-config burden, no benefit).
 */
export const ONBOARDING_BASE_URL =
  "https://github.com/Robofish89/paratus-group-dashboards/blob/main";
