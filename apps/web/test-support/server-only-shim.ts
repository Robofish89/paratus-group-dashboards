// Vitest shim for the `server-only` package. The real module throws at
// import-time so non-RSC bundles (browser code) refuse to load server-only
// modules. In tests we need to reach inside server-only modules to exercise
// them; this no-op makes that possible without weakening the production
// Next.js build, where Webpack/Turbopack still enforces the boundary.
export {};
