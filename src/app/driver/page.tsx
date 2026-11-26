import type { Metadata } from "next";

export const metadata: Metadata = { title: "Mis entregas" };

export default function DriverHomePage() {
  return (
    <main className="px-4 pb-10">
      <h1 className="mt-4 text-heading font-bold">Tus entregas</h1>
      <p className="mt-3 text-muted-foreground">
        Cuando la barra te asigne un pedido lo vas a ver acá. Al tocarlo, tu ubicación se comparte
        con el cliente hasta que lo marques como entregado.
      </p>
    </main>
  );
}
