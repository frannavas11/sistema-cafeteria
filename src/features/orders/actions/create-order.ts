"use server";

import { createClient } from "@/lib/supabase/server";
import { formatARS } from "@/lib/format";
import { checkoutSchema, type CheckoutResult } from "../types";

/** Errores de `create_order` → mensaje para el cliente (qué pasó y cómo seguir). */
function explain(message: string): CheckoutResult {
  const [code, detail] = message.split(":").map((s) => s.trim());
  switch (code) {
    case "CAFE_CLOSED":
      return { ok: false, error: "La cafetería no está tomando pedidos ahora. Probá más tarde." };
    case "CAFE_NOT_FOUND":
      return { ok: false, error: "Esta cafetería ya no está disponible." };
    case "OUT_OF_DELIVERY_AREA":
      return {
        ok: false,
        field: "address",
        error: "Esa dirección queda fuera de la zona de envío. Podés elegir retirar en el local.",
      };
    case "BELOW_MIN_ORDER":
      return {
        ok: false,
        error: `El envío a esa zona tiene un mínimo de ${formatARS(Number(detail))}. Sumá algo más o retirá en el local.`,
      };
    case "OUT_OF_STOCK":
      return { ok: false, field: "items", error: `Se terminó ${detail}. Sacalo del pedido para seguir.` };
    case "PRODUCT_UNAVAILABLE":
    case "INVALID_OPTIONS":
    case "OPTION_GROUP_CONSTRAINT":
      return {
        ok: false,
        field: "items",
        error: "La carta cambió mientras armabas el pedido. Revisá los productos y volvé a agregarlos.",
      };
    case "TOO_MANY_PENDING_ORDERS":
      return {
        ok: false,
        error: "Ya tenés varios pedidos esperando confirmación. Esperá a que la cafetería los acepte.",
      };
    case "CUSTOMER_REQUIRED":
      return { ok: false, field: "name", error: "Completá tu nombre y teléfono." };
    case "DELIVERY_ADDRESS_REQUIRED":
      return { ok: false, field: "address", error: "Falta la dirección o tu ubicación." };
    default:
      return { ok: false, error: "No pudimos enviar el pedido. Revisá tu conexión y probá de nuevo." };
  }
}

export async function createStoreOrder(input: unknown): Promise<CheckoutResult> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue.path.join(".");
    const field = path.startsWith("customer.name")
      ? "name"
      : path.startsWith("customer.phone")
        ? "phone"
        : path.startsWith("delivery")
          ? "address"
          : path.startsWith("items")
            ? "items"
            : undefined;
    return { ok: false, error: issue.message, field };
  }

  const { cafe_id, channel, items, customer, delivery, payment_method } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order", {
    p_cafe_id: cafe_id,
    p_channel: channel,
    p_items: items,
    p_customer: customer,
    p_delivery: channel === "delivery" ? delivery : undefined,
    p_payment_method: payment_method,
  });

  if (error) return explain(error.message);
  const token = data?.[0]?.tracking_token;
  if (!token) return explain("");
  return { ok: true, token };
}
