"use client";

import { cn } from "@/lib/utils";
import { useOpenState } from "../hooks/use-open-state";
import type { CafeHour } from "../types";

/** Estado abierto/cerrado sobre la franja de color del café. */
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
  if (state === null) return <span className="inline-block h-8 w-44" aria-hidden />;

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
    <span className="inline-flex h-8 items-center gap-2 rounded-full bg-primary-foreground/12 px-3 text-sm font-medium">
      <span
        aria-hidden
        className={cn("size-2 rounded-full", open ? "bg-status-ready-soft" : "bg-primary-foreground/50")}
      />
      {text}
    </span>
  );
}
