import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { getOrderTracking } from "@/features/orders/queries";
import { RoastProgress } from "@/features/orders/components/roast-progress";
import { AutoRefresh } from "@/features/orders/components/auto-refresh";
import { LocalTime } from "@/features/orders/components/local-time";
import { CHANNEL_LABEL, ORDER_STATUS } from "@/features/orders/types";
import { formatARS } from "@/lib/format";

export const metadata: Metadata = { title: "Seguimiento", robots: { index: false } };

/**
 * Seguimiento público. El segmento `[orderId]` recibe el `tracking_token` (UUID
 * secreto del pedido), nunca el id interno: los datos salen de la RPC
 * `get_order_tracking(token)`, sin lectura anónima de `orders`.
 * Fase de delivery: mapa 60–70% + hoja inferior con la curva de tueste.
 */
export default function TrackPage({ params }: PageProps<"/track/[orderId]">) {
  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" aria-hidden />}>
        <Tracking params={params} />
      </Suspense>
    </main>
  );
}

async function Tracking({ params }: Pick<PageProps<"/track/[orderId]">, "params">) {
  const { orderId: token } = await params;
  const order = await getOrderTracking(token);

  if (!order) {
    return (
      <>
        <h1 className="text-heading font-bold">No encontramos este pedido</h1>
        <p className="mt-3 text-muted-foreground">
          Revisá que el enlace esté completo. Si lo copiaste de un mensaje, abrilo desde ahí otra vez.
        </p>
      </>
    );
  }

  const meta = ORDER_STATUS[order.status];
  const finished = ["delivered", "cancelled", "rejected"].includes(order.status);
  const eta = order.estimated_ready_at;

  return (
    <>
      {!finished && <AutoRefresh />}
      <p className="text-muted-foreground">
        {order.cafe.name}, pedido <span className="numeric font-semibold text-foreground">#{order.order_number}</span>
      </p>
      <h1 className="mt-2 font-wide text-title font-extrabold">{meta.customerLabel}</h1>
      {!finished && eta && (
        <p className="mt-3 text-[1.0625rem]">
          {order.channel === "delivery" ? "Sale de la barra" : "Listo para retirar"} cerca de las{" "}
          <LocalTime iso={eta} className="numeric font-semibold" />.
        </p>
      )}

      <RoastProgress status={order.status} channel={order.channel} audience="customer" className="mt-8" />

      <div className="perforation my-8" aria-hidden />

      <dl className="space-y-3 text-[0.95rem]">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Entrega</dt>
          <dd className="text-right">
            {order.channel === "delivery" ? (order.delivery?.address ?? "Envío a domicilio") : CHANNEL_LABEL[order.channel]}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Total</dt>
          <dd className="numeric font-semibold">{formatARS(order.total)}</dd>
        </div>
      </dl>

      <p className="mt-8 text-sm text-muted-foreground">
        Guardá este enlace para volver a ver el estado. Se actualiza solo.
      </p>
      <Link
        href={`/${order.cafe.slug}`}
        className="mt-6 inline-flex min-h-tap items-center rounded-lg border border-input px-4 font-medium hover:bg-muted"
      >
        Volver a la carta
      </Link>
    </>
  );
}
