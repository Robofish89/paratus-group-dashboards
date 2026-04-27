import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import type { AppRole } from './types.js';

/** Paths excluded from auth checks */
export const AUTH_EXCLUDED_PATHS = [
  '/login',
  '/unauthorized',
  '/auth/callback',
];

/** Matcher config — exclude static files, Next.js internals, and auth pages */
export const matcherConfig = [
  '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
];

/**
 * Creates a middleware function that enforces role-based access.
 *
 * @param requiredRole - The minimum role required to access the app
 * @returns Next.js middleware handler
 *
 * Role hierarchy: admin > agent > viewer
 * - admin can access everything
 * - agent can access agent + viewer routes
 * - viewer can only access viewer routes
 */
export function createAuthMiddleware(requiredRole: AppRole) {
  const roleHierarchy: Record<AppRole, number> = {
    admin: 3,
    agent: 2,
    viewer: 1,
  };

  return async function middleware(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: Array<{ name: string; value: string; options: Record<string, unknown> }>) {
            cookiesToSet.forEach(({ name, value }: { name: string; value: string }) => {
              request.cookies.set(name, value);
            });
            supabaseResponse = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options: Record<string, unknown> }) => {
              supabaseResponse.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    // Check if path is excluded from auth
    const pathname = request.nextUrl.pathname;
    if (AUTH_EXCLUDED_PATHS.some((path) => pathname.startsWith(path))) {
      return supabaseResponse;
    }

    // Validate user session (always use getUser() for security)
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.searchParams.set('redirectTo', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Extract role from JWT claims (injected by custom_access_token_hook)
    const {
      data: { session },
    } = await supabase.auth.getSession();

    let userRole: AppRole = 'viewer'; // default fallback
    if (session?.access_token) {
      try {
        const payload = JSON.parse(
          atob(session.access_token.split('.')[1])
        );
        if (payload.user_role) {
          userRole = payload.user_role as AppRole;
        }
      } catch {
        // If JWT decode fails, fall back to viewer role
      }
    }

    // Check if user is active
    if (session?.access_token) {
      try {
        const payload = JSON.parse(
          atob(session.access_token.split('.')[1])
        );
        if (payload.user_active === false) {
          const unauthorizedUrl = request.nextUrl.clone();
          unauthorizedUrl.pathname = '/unauthorized';
          return NextResponse.redirect(unauthorizedUrl);
        }
      } catch {
        // If JWT decode fails, allow through (default active)
      }
    }

    // Check role hierarchy: user's role must be >= required role
    if (roleHierarchy[userRole] < roleHierarchy[requiredRole]) {
      const unauthorizedUrl = request.nextUrl.clone();
      unauthorizedUrl.pathname = '/unauthorized';
      return NextResponse.redirect(unauthorizedUrl);
    }

    return supabaseResponse;
  };
}
