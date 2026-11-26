"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Drawer } from "vaul";
import { LocateFixed, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatARS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Stepper } from "@/features/menu/components/product-sheet";
import { matchZone } from "@/features/delivery/lib/zones";
import type { OpenState } from "@/features/menu/lib/hours";
import type { PublicZone } from "@/features/menu/types";
import { createStoreOrder } from "../actions/create-order";
import type { useCart } from "../hooks/use-cart";
import type { CheckoutResult } from "../types";

type Cart = ReturnType<typeof useCart>;
type Channel = "pickup" | "delivery";
type Payment = "cash" | "transfer";
type Geo =
  | { state: "idle" }
  | { state: "locating" }
  | { state: "ok"; lat: number; lng: number }
  | { state: "error"; message: string };

export function CheckoutSheet({
  open,
  onOpenChange,
  cart,
  cafe,
  zones,
  openState,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: Cart;
  cafe: { id: string; name: string; address: string | null; acceptsOrders: boolean };
  zones: PublicZone[];
  openState: OpenState | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [channel, setChannel] = useState<Channel>("pickup");
  const [payment, setPayment] = useState<Payment>("cash");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [geo, setGeo] = useState<Geo>({ state: "idle" });
  const [result, setResult] = useState<Extract<CheckoutResult, { ok: false }> | null>(null);

  const delivers = zones.length > 0;
  const zone = channel === "delivery" && geo.state === "ok" ? matchZone(zones, geo) : null;
  const outOfArea = channel === "delivery" && geo.state === "ok" && zone === null;
  const belowMin = zone !== null && cart.subtotal < zone.min_order;
  const fee = zone?.fee ?? 0;
  const closed = !cafe.acceptsOrders || openState?.open === false;

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setGeo({ state: "error", message: "Tu navegador no comparte la ubicación. Elegí retirar en el local." });
      return;
    }
    setGeo({ state: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeo({ state: "ok", lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () =>
        setGeo({
          state: "error",
          message: "No pudimos ubicarte. Activá la ubicación del navegador y tocá de nuevo.",
        }),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const res = await createStoreOrder({
        cafe_id: cafe.id,
        channel,
        payment_method: payment,
        items: cart.lines.map((l) => ({
          product_id: l.product_id,
          quantity: l.quantity,
          option_item_ids: l.options.map((o) => o.id),
          notes: l.notes || undefined,
        })),
        customer: { name, phone, notes: notes || undefined },
        delivery:
          channel === "delivery" && geo.state === "ok"
            ? { address, lat: geo.lat, lng: geo.lng }
            : undefined,
      });
      if (res.ok) {
        cart.clear();
        onOpenChange(false);
        router.push(`/track/${res.token}`);
      } else {
        setResult(res);
      }
    });
  };

  const blocked =
    pending ||
    closed ||
    cart.lines.length === 0 ||
    (channel === "delivery" && (geo.state !== "ok" || outOfArea || belowMin));

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-tueste/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[94dvh] max-w-xl flex-col rounded-t-2xl bg-card outline-none">
          <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-border" aria-hidden />
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
              <Drawer.Title className="mt-4 font-wide text-[1.75rem] leading-tight font-extrabold tracking-[-0.03em]">
                Tu pedido
              </Drawer.Title>
              <Drawer.Description className="mt-1 text-muted-foreground">{cafe.name}</Drawer.Description>

              {/* Comanda */}
              {cart.lines.length === 0 && (
                <p className="mt-5 text-muted-foreground">Tu pedido está vacío. Elegí algo de la carta para empezar.</p>
              )}
              <ul className="mt-5">
                {cart.lines.map((line) => (
                  <li key={line.key} className="flex items-start gap-3 border-b border-border py-3.5 last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <p className="font-condensed text-[1.0625rem] leading-snug font-semibold">{line.name}</p>
                      {line.options.length > 0 && (
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {line.options.map((o) => o.name).join(", ")}
                        </p>
                      )}
                      {line.notes && <p className="mt-0.5 text-sm text-muted-foreground">“{line.notes}”</p>}
                      <p className="numeric mt-1 text-sm">{formatARS(line.unit_price * line.quantity)}</p>
                    </div>
                    <Stepper
                      value={line.quantity}
                      min={0}
                      label={line.name}
                      onChange={(n) => cart.setQuantity(line.key, n)}
                    />
                  </li>
                ))}
              </ul>
              {result?.field === "items" && <ErrorText>{result.error}</ErrorText>}

              <div className="perforation my-6" aria-hidden />

              {/* Cómo lo recibís */}
              <fieldset>
                <legend className="font-semibold">¿Cómo lo recibís?</legend>
                <Segmented
                  name="channel"
                  value={channel}
                  onChange={(v) => {
                    setChannel(v);
                    setResult(null);
                  }}
                  options={[
                    { value: "pickup", label: "Retiro en el local" },
                    { value: "delivery", label: "Envío a domicilio", disabled: !delivers },
                  ]}
                />
                {channel === "pickup" && cafe.address && (
                  <p className="mt-2 text-sm text-muted-foreground">Te esperamos en {cafe.address}.</p>
                )}
              </fieldset>

              {channel === "delivery" && (
                <div className="mt-5 space-y-2">
                  <Label htmlFor="co-address">Dirección de entrega</Label>
                  <Input
                    id="co-address"
                    autoComplete="street-address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Calle, número, piso o depto"
                    aria-invalid={result?.field === "address" || undefined}
                    className="h-tap"
                    required
                  />
                  <button
                    type="button"
                    onClick={locate}
                    className={cn(
                      "flex min-h-tap w-full items-center gap-2.5 rounded-lg border px-3 text-left text-sm transition-colors",
                      geo.state === "ok" ? "border-grano/50 bg-status-ready-soft" : "border-input hover:bg-muted",
                    )}
                  >
                    {geo.state === "locating" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <LocateFixed className="size-4" />
                    )}
                    <span className="flex-1">
                      {geo.state === "ok" ? "Ubicación tomada. Tocá para actualizarla." : "Usar mi ubicación para el envío"}
                    </span>
                  </button>
                  {geo.state === "error" && <ErrorText>{geo.message}</ErrorText>}
                  {outOfArea && (
                    <ErrorText>Tu ubicación queda fuera de la zona de envío. Podés retirar en el local.</ErrorText>
                  )}
                  {zone && (
                    <p className="text-sm text-muted-foreground">
                      Envío {formatARS(zone.fee)}
                      {zone.eta_minutes ? `, llega en unos ${zone.eta_minutes} minutos` : ""}.
                      {belowMin && ` El mínimo para esta zona es ${formatARS(zone.min_order)}.`}
                    </p>
                  )}
                  {result?.field === "address" && <ErrorText>{result.error}</ErrorText>}
                </div>
              )}

              {/* Contacto */}
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="co-name">Tu nombre</Label>
                  <Input
                    id="co-name"
                    autoComplete="given-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    aria-invalid={result?.field === "name" || undefined}
                    className="h-tap"
                    required
                    minLength={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="co-phone">Teléfono</Label>
                  <Input
                    id="co-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    aria-invalid={result?.field === "phone" || undefined}
                    className="h-tap"
                    required
                  />
                </div>
              </div>
              {(result?.field === "name" || result?.field === "phone") && <ErrorText>{result.error}</ErrorText>}

              <div className="mt-4 space-y-2">
                <Label htmlFor="co-notes">Algo más que debamos saber (opcional)</Label>
                <Input
                  id="co-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={channel === "delivery" ? "Timbre, referencia…" : "Paso en 15 minutos…"}
                  className="h-tap"
                  maxLength={500}
                />
              </div>

              <fieldset className="mt-6">
                <legend className="font-semibold">Pago</legend>
                <Segmented
                  name="payment"
                  value={payment}
                  onChange={setPayment}
                  options={[
                    { value: "cash", label: "Efectivo" },
                    { value: "transfer", label: "Transferencia" },
                  ]}
                />
                <p className="mt-2 text-sm text-muted-foreground">
                  {payment === "cash"
                    ? channel === "delivery"
                      ? "Pagás al recibir."
                      : "Pagás al retirar."
                    : "Te pasamos el alias cuando confirmemos el pedido."}
                </p>
              </fieldset>
            </div>

            {/* Totales + CTA */}
            <div className="shrink-0 border-t border-border px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <dl className="numeric space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Productos</dt>
                  <dd>{formatARS(cart.subtotal)}</dd>
                </div>
                {channel === "delivery" && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Envío</dt>
                    <dd>{zone ? formatARS(fee) : "Se calcula con tu ubicación"}</dd>
                  </div>
                )}
                <div className="flex items-baseline justify-between pt-1.5 font-semibold">
                  <dt className="text-base">Total</dt>
                  <dd className="text-xl font-bold tracking-[-0.01em]">{formatARS(cart.subtotal + fee)}</dd>
                </div>
              </dl>
              {result && !result.field && <ErrorText className="mt-2">{result.error}</ErrorText>}
              {closed && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {openState && !openState.open && openState.opensAt
                    ? `Ahora está cerrado. Abre ${openState.opensDay} a las ${openState.opensAt}.`
                    : "La cafetería no está tomando pedidos ahora."}
                </p>
              )}
              <button
                type="submit"
                disabled={blocked}
                className="mt-3 flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {pending && <Loader2 className="size-4 animate-spin" />}
                {pending ? "Enviando pedido" : "Confirmar pedido"}
              </button>
            </div>
          </form>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function ErrorText({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p role="alert" className={cn("text-sm text-destructive", className)}>
      {children}
    </p>
  );
}

function Segmented<T extends string>({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; disabled?: boolean }[];
}) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            "flex min-h-tap cursor-pointer items-center justify-center rounded-lg px-2 text-center text-sm font-medium transition-colors has-focus-visible:outline-2 has-focus-visible:outline-ring",
            value === o.value ? "bg-card text-foreground shadow-xs" : "text-muted-foreground",
            o.disabled && "cursor-not-allowed opacity-40",
          )}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            disabled={o.disabled}
            onChange={() => onChange(o.value)}
            className="sr-only"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}
