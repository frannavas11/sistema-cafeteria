import type { Metadata } from "next";

export const metadata: Metadata = { title: "Entrega" };

/** Fase de delivery: emitirá GPS por Supabase Broadcast (canal efímero por order_id). */
export default function DriverOrderPage() {
  return (
    <main className="px-4 pb-10">
      <h1 className="mt-4 text-heading font-bold">Entrega en curso</h1>
      <p className="mt-3 text-muted-foreground">El mapa y el envío de ubicación llegan en la fase de delivery.</p>
    </main>
  );
}
