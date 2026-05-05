// Phase 7 plan 07-01 — preload shim for `server-only` when running
// provision-users.ts under tsx.
//
// The real `server-only` module throws on import to enforce Next.js's
// RSC boundary. Tsx is plain Node — there's no RSC graph — so importing
// any module that does `import 'server-only'` (the @repo/supabase admin +
// email helpers) crashes with "This module cannot be imported from a
// Client Component module."
//
// We sidestep that by intercepting the resolver before any import fires
// and pointing `server-only` at an empty CJS module. The production Next
// build is unaffected — Webpack/Turbopack still enforce the boundary.
//
// Mirrors the same posture as apps/web/test-support/server-only-shim.ts
// (used by vitest.config.ts via the resolve.alias map).

const Module = require('node:module');

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function patchedResolve(
  request,
  parent,
  ...rest
) {
  if (request === 'server-only') {
    return require.resolve('./_server-only-shim.cjs');
  }
  return originalResolve.call(this, request, parent, ...rest);
};
