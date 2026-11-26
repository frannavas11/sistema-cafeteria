import { MapPin } from "lucide-react";
import { weekSummary } from "../lib/hours";
import type { CafeHour } from "../types";

/** Cierre de la carta: un ticket de barra cortado del rollo, con horarios y dirección. */
export function StoreTicket({
  name,
  address,
  hours,
}: {
  name: string;
  address: string | null;
  hours: CafeHour[];
}) {
  const week = weekSummary(hours);
  return (
    // La sombra va en el contenedor: la máscara del borde dentado recortaría un box-shadow.
    <div className="mx-auto mt-4 max-w-[21rem] rotate-[-0.8deg] drop-shadow-[0_14px_18px_color-mix(in_srgb,var(--ink-fixed)_18%,transparent)]">
      <aside aria-label={`Horarios de ${name}`} className="ticket-edge rounded-t-sm bg-card px-6 pt-6 pb-9">
        <p className="text-center font-wide text-lg leading-tight font-extrabold">{name}</p>
        <p className="mt-1 text-center text-[0.9375rem] text-muted-foreground italic">Horarios de la barra</p>
        <div className="perforation my-5" aria-hidden />
        <dl className="space-y-2 font-condensed text-[1.0625rem] leading-7">
          {(hours.length === 0 ? [{ days: "Abierto", time: "las 24 horas" }] : week).map((row) => (
            <div key={row.days} className="grid grid-cols-[auto_minmax(1.5rem,1fr)_auto] items-end gap-2.5">
              <dt>{row.days}</dt>
              <span className="carta-dots h-7" aria-hidden />
              <dd className="numeric font-semibold">{row.time}</dd>
            </div>
          ))}
        </dl>
        {address && (
          <>
            <div className="perforation my-5" aria-hidden />
            <p className="flex items-start justify-center gap-2 text-center text-[0.9375rem] text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              {address}
            </p>
          </>
        )}
        <p className="mt-5 text-center text-sm text-muted-foreground italic">Gracias por pedir en la barra</p>
      </aside>
    </div>
  );
}
