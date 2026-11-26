import { cn } from "@/lib/utils";
import { ORDER_STATUS, type OrderStatus } from "../types";

export function OrderStatusBadge({
  status,
  className,
  live = false,
}: {
  status: OrderStatus;
  className?: string;
  /** Pulso de atención (pedido nuevo entrando por Realtime). */
  live?: boolean;
}) {
  const meta = ORDER_STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[0.8125rem] font-semibold whitespace-nowrap",
        meta.tone,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("size-2 rounded-full", meta.dot, live && "animate-pulse-ring")}
      />
      {meta.label}
    </span>
  );
}
