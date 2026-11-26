import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/supabase";

/**
 * Cliente con secret key: BYPASSA RLS.
 * Sólo para tareas administrativas puntuales y siempre DESPUÉS de verificar
 * permisos con un guard (ej. requireSuperAdmin). Nunca para flujos de pedidos:
 * esos usan las RPCs con la sesión del usuario.
 */
export function createServiceClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY no está configurada");

  return createSupabaseClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
