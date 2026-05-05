// Phase 7 plan 07-01 — empty CJS shim that the preloader (see
// _server-only-preload.cjs) substitutes for the real `server-only`
// package when the provisioning script runs under tsx. The production
// Next.js bundle never sees this file.
module.exports = {};
