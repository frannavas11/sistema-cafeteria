import "server-only";
import { z } from "zod";
import { createPublicClient } from "@/lib/supabase/public";

const status = z.enum(["pending", "preparing", "ready", "on_the_way", "delivered", "cancelled", "rejected"]);

const trackingSchema = z.object({
  order_number: z.number(),
  status,
  channel: z.enum(["pos", "pickup", "delivery"]),
  total: z.coerce.number(),
  estimated_ready_at: z.string().nullable(),
  created_at: z.string(),
  has_driver: z.boolean(),
  delivery: z.object({ address: z.string().nullable() }).nullable(),
  cafe: z.object({ name: z.string(), slug: z.string() }),
  timeline: z.array(z.object({ status, at: z.string() })),
});

export type OrderTracking = z.infer<typeof trackingSchema>;

/**
 * Estado público de un pedido por su `tracking_token` (RPC security definer que
 * no expone nombre, teléfono ni id interno). Sin caché: el estado cambia.
 */
export async function getOrderTracking(token: string): Promise<OrderTracking | null> {
  if (!z.uuid().safeParse(token).success) return null;
  const { data, error } = await createPublicClient().rpc("get_order_tracking", { p_token: token });
  if (error || !data) return null;
  const parsed = trackingSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}
