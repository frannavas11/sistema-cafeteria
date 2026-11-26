"use client";

import { cn } from "@/lib/utils";
import { useOpenState } from "../hooks/use-open-state";
import type { CafeHour } from "../types";

/**
 * Estado abierto/cerrado sobre la franja de color del café.
 * Se codifica por forma (punto lleno = abierto, aro = cerrado) y no por color: el fondo
 * es el color de cada café y un verde o un rojo no tendrían contraste garantizado.
 */
export function OpenBadge({
  hours,
  timezone,
  acceptsOrders,
}: {
  hours: CafeHour[];
  timezone: string;
  acceptsOrders: boolean;
}) {
  const state = useOpenState(hours, timezone);
  // Reserva el lugar antes de hidratar para que la cabecera no salte.
  if (state === null) return <span className="block h-6" aria-hidden />;

  const open = state.open && acceptsOrders;
  const text = !acceptsOrders
    ? "Hoy no toma pedidos online"
    : state.open
      ? state.closesAt
        ? `Abierto hasta las ${state.closesAt}`
        : "Abierto"
      : state.opensAt
        ? `Cerrado. Abre ${state.opensDay} a las ${state.opensAt}`
        : "Cerrado por ahora";

  return (
    <p className="flex min-h-6 items-center gap-2.5 font-semibold">
      <span
        aria-hidden
        className={cn(
          "size-2.5 shrink-0 rounded-full",
          open ? "bg-current ring-4 ring-current/25" : "border-2 border-current opacity-80",
        )}
      />
      <span className="numeric">{text}</span>
    </p>
  );
}
