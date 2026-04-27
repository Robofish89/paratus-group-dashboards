// Server-only Data Access Layer barrel. Every file under ./dal/ starts with
// `import 'server-only'`; importing this barrel from a client component will
// produce a build error at compile time (the desired behaviour).

export { getCurrentUserClaims, getUserRoleRow } from './users.js';
