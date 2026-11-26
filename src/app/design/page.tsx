import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Wordmark } from "@/components/shell/wordmark";
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge";
import { RoastProgress } from "@/features/orders/components/roast-progress";
import type { OrderStatus } from "@/features/orders/types";
import { cafeThemeStyle } from "@/features/tenants/lib/theme";
import { formatARS } from "@/lib/format";

export const metadata: Metadata = { title: "Sistema de diseño", robots: { index: false } };

const PALETTE = [
  { name: "Porcelana", token: "porcelana", hex: "#EDEFEA", role: "Fondo. El blanco mineral del bowl de cata." },
  { name: "Loza", token: "loza", hex: "#FAFBF8", role: "Superficies elevadas: hojas, tarjetas, tickets." },
  { name: "Tueste", token: "tueste", hex: "#2A1A12", role: "Tinta. Texto, barra lateral, el negro de la casa." },
  { name: "Cáscara", token: "cascara", hex: "#A3172F", role: "Acción y atención: botón principal, pedido nuevo." },
  { name: "Crema", token: "crema", hex: "#C47F1F", role: "En preparación. Avisos que no son errores." },
  { name: "Grano verde", token: "grano", hex: "#6F7D48", role: "Listo para entregar. Confirmaciones." },
  { name: "Acequia", token: "acequia", hex: "#2D5F7A", role: "En camino. Foco de teclado e información." },
] as const;

const SWATCH: Record<(typeof PALETTE)[number]["token"], string> = {
  porcelana: "bg-porcelana",
  loza: "bg-loza",
  tueste: "bg-tueste",
  cascara: "bg-cascara",
  crema: "bg-crema",
  grano: "bg-grano",
  acequia: "bg-acequia",
};

const STATUSES: OrderStatus[] = [
  "pending",
  "preparing",
  "ready",
  "on_the_way",
  "delivered",
  "cancelled",
  "rejected",
];

const TENANTS = [
  { name: "Tostado Norte", color: "#1E4D6B" },
  { name: "Molienda Sur", color: "#4F6B52" },
  { name: "Café Pampa", color: "#E8C547" },
];

export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto max-w-6xl px-6 pb-24">
      <header className="flex flex-wrap items-center justify-between gap-4 py-8">
        <Wordmark className="text-2xl" />
        <ThemeToggle />
      </header>

      <section className="grid gap-10 border-t border-border pt-14 lg:grid-cols-[1fr_1.2fr]">
        <h1 className="font-wide text-display font-extrabold">Porcelana y cáscara</h1>
        <div className="max-w-prose self-end text-[1.0625rem] leading-relaxed text-muted-foreground">
          <p>
            El sistema sale de la barra, no de una plantilla: el bowl de cata, la cereza madura, la
            curva de tueste y la comanda impresa. Una sola familia tipográfica cambia de ancho
            según el trabajo. Expandida para nombrar, normal para leer, condensada para operar.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------ Paleta */}
      <Section title="Color" note="Cada color tiene un trabajo. Si no lo tiene, no entra.">
        <ul className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {PALETTE.map((c) => (
            <li key={c.token}>
              <div className={`h-24 rounded-xl border border-border ${SWATCH[c.token]}`} />
              <p className="mt-3 font-semibold">{c.name}</p>
              <p className="numeric text-sm text-muted-foreground">{c.hex}</p>
              <p className="mt-1 text-sm leading-snug">{c.role}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* ------------------------------------------------------- Tipografía */}
      <Section title="Tipografía" note="Archivo, variable en peso y ancho.">
        <div className="grid gap-12">
          <div>
            <p className="font-wide text-display font-extrabold">Flat white</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Display, ancho 118, peso 800. Nombres de cafetería y de producto en la tienda.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <p className="text-title font-bold">Filtrados del día</p>
              <p className="mt-4 max-w-[60ch] leading-relaxed">
                Origen rotativo de Huila, lavado, tostado el martes. Notas de mandarina y panela.
                Se sirve en V60 con 15 g para 250 ml. Preguntá en la barra cuál está hoy.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">Título 39 px, cuerpo 16 px con interlineado 1,6</p>
            </div>
            <div data-density="compact" className="rounded-xl border border-border bg-loza p-4">
              <p className="text-sm text-muted-foreground">Condensado para el mostrador</p>
              <ul className="mt-3 divide-y divide-border">
                {[
                  ["2 × Flat white, avena", 8400],
                  ["1 × Cardamom bun", 3200],
                  ["1 × V60 del día", 4200],
                ].map(([line, price]) => (
                  <li key={line} className="flex items-baseline justify-between py-2.5 text-[0.9375rem]">
                    <span className="font-condensed font-medium">{line}</span>
                    <span className="numeric font-semibold">{formatARS(Number(price))}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------ Estados de pedido */}
      <Section
        title="Curva de tueste"
        note="El pedido avanza como un grano en el tostador. Es el único elemento decorativo del sistema."
      >
        <div className="grid gap-10">
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <OrderStatusBadge key={s} status={s} live={s === "pending"} />
            ))}
          </div>
          <div className="grid gap-10 md:grid-cols-2">
            <Demo label="Delivery, en camino (vista cliente)">
              <RoastProgress status="on_the_way" channel="delivery" audience="customer" />
            </Demo>
            <Demo label="Retira en local, listo (vista barra)">
              <RoastProgress status="ready" channel="pickup" />
            </Demo>
            <Demo label="Cancelado">
              <RoastProgress status="cancelled" channel="delivery" audience="customer" />
            </Demo>
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------------- Controles */}
      <Section title="Controles" note="Radios con jerarquía: 8px controles, 14px superficies, 24px hojas.">
        <div className="grid gap-12 lg:grid-cols-[1fr_1fr_0.9fr]">
          <div className="grid content-start gap-3">
            <Button size="lg" className="h-11 px-4">Confirmar pedido</Button>
            <Button size="lg" variant="outline" className="h-11 px-4">Ver carta</Button>
            <Button size="lg" variant="secondary" className="h-11 px-4">Guardar borrador</Button>
            <Button size="lg" variant="destructive" className="h-11 px-4">Rechazar pedido</Button>
            <div className="mt-4 grid gap-2">
              <Label htmlFor="demo-address">Dirección de entrega</Label>
              <Input id="demo-address" placeholder="Calle y número" className="h-11" />
            </div>
          </div>

          <div data-density="compact">
            <p className="mb-3 text-sm text-muted-foreground">Botón de producto en el POS (48px mínimo)</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["Flat white", 3600],
                ["Cortado", 2900],
                ["V60 del día", 4200],
                ["Cardamom bun", 3200],
              ].map(([name, price], i) => (
                <button
                  key={name}
                  type="button"
                  className="group flex min-h-24 flex-col justify-between rounded-xl border border-border bg-loza p-3 text-left transition-colors hover:border-primary active:bg-secondary"
                >
                  <span className="font-condensed text-[1.0625rem] leading-tight font-semibold">{name}</span>
                  <span className="flex items-end justify-between">
                    <span className="numeric text-sm text-muted-foreground">{formatARS(Number(price))}</span>
                    <kbd className="rounded border border-border px-1.5 text-[0.6875rem] text-muted-foreground">
                      {i + 1}
                    </kbd>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <Ticket />
        </div>
      </Section>

      {/* ------------------------------------------------- Marca por tenant */}
      <Section
        title="Cada cafetería, su color"
        note="El color de marca reemplaza a cáscara en acciones primarias. El texto se elige por contraste."
      >
        <div className="grid gap-6 sm:grid-cols-3">
          {TENANTS.map((t) => (
            <div
              key={t.name}
              style={cafeThemeStyle({ brand_color: t.color })}
              className="rounded-xl border border-border bg-loza p-5"
            >
              <p className="font-wide text-xl font-bold">{t.name}</p>
              <Button size="lg" className="mt-6 h-11 w-full gap-2">
                <Plus className="size-4" aria-hidden />
                Agregar al pedido
              </Button>
            </div>
          ))}
        </div>
      </Section>
    </main>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-8 border-t border-border pt-10 mt-20 lg:grid-cols-[14rem_1fr]">
      <div>
        <h2 className="text-heading font-bold">{title}</h2>
        <p className="mt-2 text-sm leading-snug text-muted-foreground">{note}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

function Demo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/** Comanda de barra: lo que imprime el POS. */
function Ticket() {
  return (
    <div className="mx-auto w-full max-w-[19rem] rounded-xl bg-loza p-5 shadow-[0_1px_0_var(--linea),0_18px_40px_-24px_color-mix(in_srgb,var(--tueste)_45%,transparent)]">
      <div className="flex items-baseline justify-between">
        <p className="font-wide text-[1.75rem] font-extrabold numeric">#128</p>
        <OrderStatusBadge status="preparing" />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Retira Martina, 09:42</p>
      <div className="perforation my-4" />
      <ul data-density="compact" className="grid gap-2 text-[0.9375rem]">
        <li className="flex justify-between gap-3">
          <span className="font-condensed">
            2 × Flat white
            <span className="block text-sm text-muted-foreground">Avena, shot extra</span>
          </span>
          <span className="numeric">{formatARS(10200)}</span>
        </li>
        <li className="flex justify-between gap-3">
          <span className="font-condensed">1 × Cardamom bun</span>
          <span className="numeric">{formatARS(3200)}</span>
        </li>
      </ul>
      <div className="perforation my-4" />
      <div className="flex items-baseline justify-between font-semibold">
        <span>Total</span>
        <span className="numeric text-lg">{formatARS(13400)}</span>
      </div>
    </div>
  );
}
