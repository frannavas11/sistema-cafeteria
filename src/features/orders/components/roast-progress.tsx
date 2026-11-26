import { cn } from "@/lib/utils";
import { ORDER_STATUS, roastSteps, type OrderChannel, type OrderStatus } from "../types";

const ROAST_BG = ["bg-roast-0", "bg-roast-1", "bg-roast-2", "bg-roast-3", "bg-roast-4"] as const;

/**
 * Curva de tueste: el progreso del pedido como un grano que se tuesta.
 * Cada tramo alcanzado toma el color de su grado de tueste (verde → full city);
 * los pendientes quedan en porcelana. Es el elemento firma del sistema.
 */
export function RoastProgress({
  status,
  channel,
  audience = "staff",
  className,
}: {
  status: OrderStatus;
  channel: OrderChannel;
  audience?: "staff" | "customer";
  className?: string;
}) {
  const steps = roastSteps(channel);
  const halted = ORDER_STATUS[status].roast === null;
  const current = halted ? -1 : steps.indexOf(status);

  return (
    <div className={cn("w-full", className)}>
      <ol className="flex gap-1" aria-label="Progreso del pedido">
        {steps.map((step, i) => {
          const meta = ORDER_STATUS[step];
          const reached = i <= current;
          const shade = ROAST_BG[meta.roast ?? 0];
          return (
            <li key={step} className="flex-1" aria-current={i === current ? "step" : undefined}>
              <div
                className={cn(
                  "h-2.5 rounded-[3px] transition-colors duration-700",
                  reached ? shade : "bg-muted",
                  i === current && "ring-2 ring-offset-2 ring-offset-background ring-input",
                )}
              />
              <span
                className={cn(
                  "mt-2 block text-xs leading-tight",
                  reached ? "text-foreground font-medium" : "text-muted-foreground",
                  i === current && "font-semibold",
                )}
              >
                {audience === "customer" ? meta.customerLabel : meta.label}
              </span>
            </li>
          );
        })}
      </ol>
      {halted && (
        <p className="mt-3 text-sm text-muted-foreground">{ORDER_STATUS[status].customerLabel}</p>
      )}
    </div>
  );
}
