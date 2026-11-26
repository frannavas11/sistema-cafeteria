import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { parseCafeConfig, type PublicCafe } from "./types";

export type CafeListing = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  tagline?: string;
  brand_color?: string;
  cover_url?: string;
};

/** Cafeterías activas para el directorio de la home (RLS: sólo las públicas). */
export async function listPublicCafes(): Promise<CafeListing[]> {
  "use cache";
  cacheTag("cafes");
  cacheLife("minutes");

  const { data } = await createPublicClient()
    .from("cafes")
    .select("id, name, slug, address, config")
    .order("name");

  return (data ?? []).map(({ config, ...c }) => {
    const { tagline, brand_color, cover_url } = parseCafeConfig(config);
    return { ...c, tagline, brand_color, cover_url };
  });
}

/** Café público por slug (cacheado; invalidar desde una Server Action con `updateTag('cafe:<slug>')`). */
export async function getPublicCafe(slug: string): Promise<PublicCafe | null> {
  "use cache";
  cacheTag(`cafe:${slug}`);
  cacheLife("minutes");

  const supabase = createPublicClient();
  const { data } = await supabase
    .from("cafes")
    .select("id, name, slug, address, lat, lng, accepts_orders, timezone, config")
    .eq("slug", slug)
    .maybeSingle();

  if (!data) return null;
  return { ...data, config: parseCafeConfig(data.config) };
}
