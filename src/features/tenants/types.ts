import { z } from "zod";
import type { Tables } from "@/types/supabase";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color hex de 6 dígitos");
// https externo, o una foto de prueba servida desde /public/mock (solo datos de demo).
const httpsUrl = z.union([
  z.url({ protocol: /^https$/ }),
  z.string().regex(/^\/mock\/[\w/-]+\.(jpg|png|webp)$/),
]);

/**
 * Config pública de una cafetería (columna `cafes.config`). Nunca guardar secretos acá.
 * Cada campo tiene su propio `.catch`: un valor inválido cae a su default sin
 * descartar el resto de la config (color, tagline, etc.).
 */
export const cafeConfigSchema = z.object({
  brand_color: hex.optional().catch(undefined),
  currency: z.string().length(3).default("ARS").catch("ARS"),
  prep_minutes: z.number().int().min(1).max(180).default(15).catch(15),
  tagline: z.string().max(140).optional().catch(undefined),
  logo_url: httpsUrl.optional().catch(undefined),
  cover_url: httpsUrl.optional().catch(undefined),
});

export type CafeConfig = z.infer<typeof cafeConfigSchema>;

export type PublicCafe = Pick<
  Tables<"cafes">,
  "id" | "name" | "slug" | "address" | "lat" | "lng" | "accepts_orders" | "timezone"
> & { config: CafeConfig };

/** Parseo tolerante: una config inválida no rompe la tienda. */
export function parseCafeConfig(raw: unknown): CafeConfig {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return cafeConfigSchema.parse(input);
}
