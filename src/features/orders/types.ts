import { z } from "zod";
import type { OrderChannel, OrderStatus } from "@/types/supabase";

export type { OrderChannel, OrderStatus };

// ---------------------------------------------------------------- checkout ---
/**
 * Pedido desde la tienda. Sólo viajan ids, cantidades y datos de contacto:
 * nada de precios ni totales (zero trust; `create_order` los recalcula).
 */
export const checkoutSchema = z
  .object({
    cafe_id: z.uuid(),
    channel: z.enum(["pickup", "delivery"]),
    items: z
      .array(
        z.object({
          product_id: z.uuid(),
          quantity: z.number().int().min(1).max(100),
          option_item_ids: z.array(z.uuid()).max(20),
          notes: z.string().trim().max(200).optional(),
        }),
      )
      .min(1, "Agregá algo al pedido.")
      .max(50),
    customer: z.object({
      name: z.string().trim().min(2, "Decinos tu nombre.").max(80),
      phone: z
        .string()
        .trim()
        .regex(/^[0-9+()\s-]{6,30}$/, "Revisá el teléfono: solo números, entre 6 y 30."),
      notes: z.string().trim().max(500).optional(),
    }),
    delivery: z
      .object({
        address: z.string().trim().min(4, "Escribí la dirección de entrega.").max(240),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .optional(),
    payment_method: z.enum(["cash", "transfer"]),
  })
  .refine((v) => v.channel !== "delivery" || v.delivery !== undefined, {
    path: ["delivery"],
    message: "Para el envío necesitamos la dirección y tu ubicación.",
  });

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export type CheckoutResult =
  | { ok: true; token: string }
  | { ok: false; error: string; field?: "name" | "phone" | "address" | "items" };

type StatusMeta = {
  /** Etiqueta para staff (POS/recepción). */
  label: string;
  /** Frase para el cliente en /track. */
  customerLabel: string;
  /** Posición en la curva de tueste (0–4). `null` = fuera del flujo (cancelado/rechazado). */
  roast: 0 | 1 | 2 | 3 | 4 | null;
  /** Clases de color semántico (texto + fondo suave). */
  tone: string;
  dot: string;
};

export const ORDER_STATUS: Record<OrderStatus, StatusMeta> = {
  pending: {
    label: "Nuevo",
    customerLabel: "Recibimos tu pedido",
    roast: 0,
    tone: "text-status-pending bg-status-pending-soft",
    dot: "bg-status-pending",
  },
  preparing: {
    label: "En preparación",
    customerLabel: "Lo estamos preparando",
    roast: 1,
    tone: "text-status-preparing bg-status-preparing-soft",
    dot: "bg-status-preparing",
  },
  ready: {
    label: "Listo",
    customerLabel: "Tu pedido está listo",
    roast: 2,
    tone: "text-status-ready bg-status-ready-soft",
    dot: "bg-status-ready",
  },
  on_the_way: {
    label: "En camino",
    customerLabel: "Va en camino",
    roast: 3,
    tone: "text-status-on-the-way bg-status-on-the-way-soft",
    dot: "bg-status-on-the-way",
  },
  delivered: {
    label: "Entregado",
    customerLabel: "Entregado. ¡Que lo disfrutes!",
    roast: 4,
    tone: "text-status-delivered bg-status-delivered-soft",
    dot: "bg-status-delivered",
  },
  cancelled: {
    label: "Cancelado",
    customerLabel: "El pedido fue cancelado",
    roast: null,
    tone: "text-status-cancelled bg-status-cancelled-soft line-through decoration-1",
    dot: "bg-status-cancelled",
  },
  rejected: {
    label: "Rechazado",
    customerLabel: "La cafetería no pudo tomar tu pedido",
    roast: null,
    tone: "text-status-cancelled bg-status-cancelled-soft",
    dot: "bg-status-cancelled",
  },
};

export const CHANNEL_LABEL: Record<OrderChannel, string> = {
  pos: "Mostrador",
  pickup: "Retira",
  delivery: "Delivery",
};

/** Pasos visibles de la curva según canal (pickup/pos no pasan por "en camino"). */
export function roastSteps(channel: OrderChannel): OrderStatus[] {
  return channel === "delivery"
    ? ["pending", "preparing", "ready", "on_the_way", "delivered"]
    : ["pending", "preparing", "ready", "delivered"];
}
