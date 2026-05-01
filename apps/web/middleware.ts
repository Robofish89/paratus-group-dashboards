import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  countryCodeToSlug,
  isCountrySlug,
  type AppRole,
  type CountryCode,
  type UserClaims,
} from "@repo/supabase/types";

/**
 * Paths that bypass the auth gate. Anything else requires an authenticated
 * Supabase session AND a valid `user_role` claim.
 */
const PUBLIC_PATHS = new Set<string>([
  "/login",
  "/unauthorized",
  "/auth/callback",
  "/api/health",
  // Logout must short-circuit role-routing — otherwise the agent
  // branch below redirects POST /api/auth/logout to /<cc>/queue and
  // the user never gets signed out.
  "/api/auth/logout",
  // Lead-ingest API routes (`/api/leads/*`) are handled by the prefix
  // bypass below — each route does its own auth (HMAC for the webhook,
  // cookie session for the importer). No per-path entry needed here.
]);

/**
 * E2E auth-bridge route bypasses middleware so Playwright can mint a session
 * without already having one. The route itself returns 404 unless
 * `E2E_AUTH_ENABLED=true` is set (which Vercel production never does), so
 * publicly accepting traffic here is safe in dev/test only.
 */
const E2E_LOGIN_PATH = "/api/e2e-login";

/**
 * Decode the middle (payload) segment of a JWT without pulling in a crypto
 * lib. We only TRUST `auth.getUser()` for identity — these claims are read
 * post-validation purely to make a routing decision.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payload = parts[1];
  if (!payload) return null;

  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");

  try {
    const json =
      typeof globalThis.atob === "function"
        ? globalThis.atob(padded)
        : Buffer.from(padded, "base64").toString("utf-8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asAppRole(value: unknown): AppRole | null {
  return value === "hq_admin" || value === "country_admin" || value === "agent"
    ? value
    : null;
}

function asCountryCode(value: unknown): CountryCode | null {
  if (typeof value !== "string" || value.length !== 2) return null;
  return value.toUpperCase() as CountryCode;
}

function readClaims(accessToken: string | undefined): UserClaims | null {
  if (!accessToken) return null;
  const payload = decodeJwtPayload(accessToken);
  if (!payload) return null;
  return {
    user_role: asAppRole(payload.user_role),
    country_code: asCountryCode(payload.country_code),
    user_active: payload.user_active !== false,
  };
}

/**
 * Returns the leading two-letter URL country segment (lowercased) when the
 * pathname starts with one. Otherwise null.
 */
function pathCountrySlug(pathname: string): string | null {
  const match = pathname.match(/^\/([a-z]{2})(?:\/|$)/);
  return match ? match[1]! : null;
}

export async function middleware(request: NextRequest) {
  const supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options: CookieOptions;
          }>,
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() re-validates the access token against Supabase; getSession()
  // alone trusts the cookie blindly and is unsafe for the auth gate.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  // Allow public paths regardless of auth state.
  if (PUBLIC_PATHS.has(pathname)) {
    return supabaseResponse;
  }

  // E2E test login bypass — only meaningful when the route itself is enabled
  // via env (the route returns 404 otherwise). Letting the request through
  // here means Playwright can land on the route without an existing session.
  if (
    pathname === E2E_LOGIN_PATH &&
    process.env.E2E_AUTH_ENABLED === "true"
  ) {
    return supabaseResponse;
  }

  // Lead ingest API routes do their own auth (HMAC for the webhook, cookie
  // session inside the handler for the CSV importer). Skipping middleware
  // here means external callers (n8n, curl) get a clean 401/403 JSON response
  // instead of a 307 redirect to /login.
  if (pathname.startsWith("/api/leads/")) {
    return supabaseResponse;
  }

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    if (pathname !== "/") {
      loginUrl.searchParams.set("redirectTo", pathname + search);
    } else {
      loginUrl.searchParams.set("redirectTo", "/");
    }
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated: read role + country claims to route the request.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = readClaims(session?.access_token);

  if (!claims || claims.user_active === false || claims.user_role === null) {
    const url = request.nextUrl.clone();
    url.pathname = "/unauthorized";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (claims.user_role === "hq_admin") {
    // HQ admins can visit any path. No redirect.
    return supabaseResponse;
  }

  // country_admin and agent require a country claim.
  if (!claims.country_code) {
    const url = request.nextUrl.clone();
    url.pathname = "/unauthorized";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const cc = countryCodeToSlug(claims.country_code);
  const segment = pathCountrySlug(pathname);

  if (claims.user_role === "country_admin") {
    // Root → bounce to their country home.
    if (pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = `/${cc}`;
      url.search = "";
      return NextResponse.redirect(url);
    }
    // A country prefix that isn't theirs → bounce to their country.
    if (segment && isCountrySlug(segment.toUpperCase()) && segment !== cc) {
      const url = request.nextUrl.clone();
      url.pathname = `/${cc}`;
      url.search = "";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  if (claims.user_role === "agent") {
    const queueHome = `/${cc}/queue`;
    // Cross-country block (any other country prefix → bounce to own queue).
    if (segment && isCountrySlug(segment.toUpperCase()) && segment !== cc) {
      const url = request.nextUrl.clone();
      url.pathname = queueHome;
      url.search = "";
      return NextResponse.redirect(url);
    }
    // Root → push to the queue home.
    if (pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = queueHome;
      url.search = "";
      return NextResponse.redirect(url);
    }
    // Within own country but outside the queue (e.g. /mz, /mz/admin) →
    // push to the queue home. Paths without a country prefix fall through
    // so unknown routes (/atlantis, /foo) can resolve to a Next.js 404.
    if (segment === cc && !pathname.startsWith(queueHome)) {
      const url = request.nextUrl.clone();
      url.pathname = queueHome;
      url.search = "";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
