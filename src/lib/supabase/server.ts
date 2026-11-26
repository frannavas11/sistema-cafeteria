import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/supabase";

/**
 * Cliente de servidor con la sesión del usuario (respeta RLS).
 * Lee cookies → sólo llamarlo dentro de un límite <Suspense> o en Server Actions
 * (requisito de Cache Components).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component: cookies de sólo lectura. El proxy refresca la sesión.
          }
        },
      },
    },
  );
}

/**
 * Usuario actual verificado (JWT validado por Supabase Auth). Deduplicado por request.
 * Devuelve `null` si no hay sesión.
 */
export const getCurrentUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub;
});
