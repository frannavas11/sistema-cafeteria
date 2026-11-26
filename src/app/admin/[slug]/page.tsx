import type { Metadata } from "next";

export const metadata: Metadata = { title: "Pedidos" };

/** Tablero de recepción (Fase 2+: Postgres Changes filtrado por cafe_id). */
export default function OrdersBoardPage() {
  return (
    <main className="px-6 py-8 md:px-10">
      <h1 className="text-title font-bold">Pedidos</h1>
      <div className="mt-8 rounded-xl border border-dashed border-input p-10">
        <p className="max-w-md text-muted-foreground">
          Cuando entre un pedido online aparece acá, con aviso sonoro. Desde esta pantalla lo
          aceptás, lo pasás a preparación y le asignás repartidor.
        </p>
      </div>
    </main>
  );
}
