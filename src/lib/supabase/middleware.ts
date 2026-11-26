import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import { isSafeNext } from "@/lib/auth/safe-next";
import type { Database } from "@/types/supabase";

const PROTECTED_PREFIXES = ["/admin", "/super-admin", "/driver"] as const;

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refresca la sesión de Supabase y hace el chequeo OPTIMISTA de acceso:
 * sólo "¿hay sesión?", leyendo el JWT (sin consultas a la base, como recomienda
 * Next 16 para el proxy, que corre también en cada prefetch).
 * El ROL lo validan los guards de `src/lib/auth/guards.ts` en cada layout y
 * Server Action; la garantía final es RLS.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // No ejecutar código entre createServerClient y getClaims (refresco de sesión).
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub ?? null;

  const { pathname, search } = request.nextUrl;

  // `path` puede traer query (ej. next=/admin/x?tab=y): se parsea como URL relativa.
  // Mantiene las cookies refrescadas en el redirect.
  const redirectTo = (path: string, params?: Record<string, string>) => {
    const url = new URL(path, request.url);
    if (url.origin !== request.nextUrl.origin) url.href = new URL("/admin", request.url).href;
    if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  if (pathname === "/login") {
    if (userId) {
      const next = request.nextUrl.searchParams.get("next");
      return redirectTo(isSafeNext(next) ? next : "/admin");
    }
    return response;
  }

  if (isProtected(pathname) && !userId) {
    return redirectTo("/login", { next: pathname + search });
  }

  return response;
}
