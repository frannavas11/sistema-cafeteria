import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/supabase";

/**
 * Cliente anónimo SIN cookies para datos públicos (carta, café por slug).
 * Al no depender de la request puede usarse dentro de `'use cache'`.
 * Usa la publishable key → mismas reglas RLS que un visitante anónimo.
 */
export function createPublicClient() {
  return createSupabaseClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
