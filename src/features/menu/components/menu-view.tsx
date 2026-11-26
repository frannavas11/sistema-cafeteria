"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { formatARS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCart } from "@/features/orders/hooks/use-cart";
import { CheckoutSheet } from "@/features/orders/components/checkout-sheet";
import { useOpenState } from "../hooks/use-open-state";
import { needsChoice, type MenuProduct, type StoreMenu } from "../types";
import { ProductImage } from "./product-image";
import { ProductSheet } from "./product-sheet";

type Props = {
  cafe: { id: string; name: string; address: string | null; acceptsOrders: boolean; timezone: string };
  menu: StoreMenu;
  /** Cierre de la carta (ticket con horarios), renderizado en el servidor. */
  footer?: React.ReactNode;
};

// Curva de tueste: cada categoría toma un grado, del grano verde al full city.
const ROAST = ["bg-roast-0", "bg-roast-1", "bg-roast-2", "bg-roast-3", "bg-roast-4"] as const;

/** Carta interactiva: recomendados, navegación por categoría, ficha, carrito y checkout. */
export function MenuView({ cafe, menu, footer }: Props) {
  const cart = useCart(cafe.id);
  const openState = useOpenState(menu.hours, cafe.timezone);
  const [product, setProduct] = useState<MenuProduct | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const active = useActiveSection(menu.categories.map((c) => c.id));
  const chipsRef = useRef<HTMLUListElement>(null);

  // La categoría activa queda a la vista en la tira de chips mientras se recorre la carta.
  useEffect(() => {
    const list = chipsRef.current;
    const chip = list?.querySelector<HTMLElement>("[aria-current]");
    if (!list || !chip) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollTo({ left: chip.offsetLeft - 20, behavior: reduce ? "auto" : "smooth" });
  }, [active]);

  const quickAdd = (p: MenuProduct) => {
    if (needsChoice(p)) return setProduct(p);
    cart.add({ product_id: p.id, name: p.name, unit_price: p.price, quantity: 1, options: [], notes: "" });
    toast(`Sumaste ${p.name}`, { description: "Está en tu pedido.", duration: 1800 });
  };

  if (menu.categories.length === 0) {
    return (
      <p className="py-12 text-muted-foreground">
        La carta online todavía no está publicada.
        {cafe.address ? ` Mientras tanto, te esperamos en ${cafe.address}.` : ""}
      </p>
    );
  }

  // Recomendados: lo primero de cada categoría que tenga foto y esté disponible
  // (el orden de la carta lo decide la cafetería).
  const featured = menu.categories
    .map((c) => c.products.find((p) => p.image_url && p.is_available))
    .filter((p): p is MenuProduct => p !== undefined)
    .slice(0, 6);

  return (
    <>
      {featured.length > 1 && (
        <section aria-labelledby="destacados" className="pt-9">
          <h2 id="destacados" className="font-wide text-[1.5rem] leading-tight font-extrabold tracking-[-0.02em]">
            La barra recomienda
          </h2>
          <ul className="-mx-5 mt-4 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none]">
            {featured.map((p, i) => (
              <li key={p.id} className="w-[64%] shrink-0 snap-start sm:w-56">
                <button
                  type="button"
                  onClick={() => setProduct(p)}
                  className="group block w-full rounded-xl text-left"
                >
                  <span className="relative block aspect-[4/5] overflow-hidden rounded-xl bg-muted">
                    <ProductImage
                      src={p.image_url!}
                      sizes="(max-width: 640px) 64vw, 224px"
                      priority={i < 2}
                      className="transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                    <PhotoEdge />
                    <span className="numeric absolute bottom-2.5 left-2.5 rounded-md bg-loza px-2 py-0.5 text-[0.95rem] font-bold text-tueste">
                      {formatARS(p.price)}
                    </span>
                  </span>
                  <span className="mt-2.5 block text-[1.0625rem] leading-snug font-semibold tracking-[-0.01em]">
                    {p.name}
                  </span>
                  {p.description && (
                    <span className="mt-0.5 line-clamp-1 block text-[0.9375rem] text-muted-foreground italic">
                      {p.description}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {menu.categories.length > 1 && (
        <nav
          aria-label="Categorías de la carta"
          className="sticky top-0 z-30 -mx-5 mt-7 border-b border-border bg-background/95 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/85"
        >
          <ul ref={chipsRef} className="flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]">
            {menu.categories.map((c, i) => {
              const current = active === c.id;
              return (
                <li key={c.id} className="shrink-0">
                  <a
                    href={`#cat-${c.id}`}
                    aria-current={current ? "true" : undefined}
                    className={cn(
                      "flex h-tap items-center gap-2 rounded-full border px-4 text-[0.9375rem] font-medium transition-colors",
                      current
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card hover:border-foreground/40",
                    )}
                  >
                    <span aria-hidden className={cn("size-2 rounded-full", ROAST[i % ROAST.length])} />
                    {c.name}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <div className="pb-10">
        {menu.categories.map((c, i) => (
          <section key={c.id} id={`cat-${c.id}`} aria-labelledby={`h-${c.id}`} className="scroll-mt-20 pt-11">
            <h2
              id={`h-${c.id}`}
              className="font-wide text-[2rem] leading-[0.95] font-extrabold tracking-[-0.03em]"
            >
              {c.name}
            </h2>
            <div className="mt-3 flex items-center gap-3">
              <span aria-hidden className={cn("h-1.5 w-10 rounded-full", ROAST[i % ROAST.length])} />
              <span aria-hidden className="h-px flex-1 bg-border" />
              <span className="numeric font-condensed text-[0.9375rem] text-muted-foreground">
                {c.products.length} {c.products.length === 1 ? "opción" : "opciones"}
              </span>
            </div>
            {c.description && <p className="mt-3 max-w-[60ch] text-muted-foreground italic">{c.description}</p>}
            <ul className="mt-1">
              {c.products.map((p) => (
                <ProductRow key={p.id} product={p} onOpen={() => setProduct(p)} onAdd={() => quickAdd(p)} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className={cart.count > 0 ? "pb-32" : "pb-16"}>{footer}</div>

      {cart.count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setCheckoutOpen(true)}
            className="flex h-15 w-full items-center justify-between gap-3 rounded-xl bg-primary pr-5 pl-3 font-semibold text-primary-foreground shadow-[0_14px_34px_-14px_var(--ink-fixed)] transition-transform active:scale-[0.99]"
          >
            <span className="flex items-center gap-3">
              <span
                key={cart.count}
                className="numeric flex size-9 animate-in items-center justify-center rounded-lg bg-primary-foreground text-[0.95rem] font-bold text-primary zoom-in-75 duration-200"
              >
                {cart.count}
              </span>
              <span className="text-[1.0625rem]">Ver pedido</span>
            </span>
            <span className="numeric text-lg">{formatARS(cart.subtotal)}</span>
          </button>
        </div>
      )}

      <ProductSheet product={product} onClose={() => setProduct(null)} onAdd={cart.add} />
      <CheckoutSheet
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        cart={cart}
        cafe={cafe}
        zones={menu.zones}
        openState={openState}
      />
    </>
  );
}

/** Categoría que se está leyendo: la que cruza la franja superior de la pantalla. */
function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join(",");
  useEffect(() => {
    const sections = key
      .split(",")
      .map((id) => document.getElementById(`cat-${id}`))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length < 2) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id.slice(4));
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [key]);
  return active;
}

/** Filete interior: separa del fondo las fotos claras (una taza blanca sobre porcelana). */
function PhotoEdge() {
  return <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-ink/10 ring-inset" />;
}

function ProductRow({
  product,
  onOpen,
  onAdd,
}: {
  product: MenuProduct;
  onOpen: () => void;
  onAdd: () => void;
}) {
  const available = product.is_available;
  const choose = needsChoice(product);
  return (
    <li className="flex items-start gap-4 border-b border-border py-5 last:border-b-0">
      <button
        type="button"
        onClick={onOpen}
        disabled={!available}
        className="group min-w-0 flex-1 rounded-md text-left disabled:cursor-not-allowed"
      >
        {/* Nombre ······ precio. Si el nombre baja a dos renglones, los puntos siguen al último. */}
        <span className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-1.5 text-[1.0625rem] leading-[1.35]">
          <span className="carta-dots block">
            <span
              className={cn(
                "carta-name font-semibold tracking-[-0.01em] transition-colors group-hover:text-primary",
                !available && "text-muted-foreground line-through decoration-1",
              )}
            >
              {product.name}
            </span>
          </span>
          <span className={cn("numeric font-semibold", !available && "text-muted-foreground")}>
            {formatARS(product.price)}
          </span>
        </span>
        {product.description && (
          <span className="mt-1.5 line-clamp-2 block text-[0.9375rem] leading-relaxed text-muted-foreground italic">
            {product.description}
          </span>
        )}
        {!available ? (
          <span className="mt-2 block text-sm font-medium text-destructive">Se terminó por hoy</span>
        ) : (
          product.option_groups.length > 0 && (
            <span className="mt-2 block text-sm text-tueste-2">
              A tu gusto: {product.option_groups.map((g) => g.name.toLowerCase()).join(" y ")}
            </span>
          )
        )}
      </button>

      <div className="relative shrink-0">
        {product.image_url && (
          <button
            type="button"
            onClick={onOpen}
            disabled={!available}
            tabIndex={-1}
            aria-hidden
            className="relative block size-24 overflow-hidden rounded-xl bg-muted"
          >
            <ProductImage src={product.image_url} sizes="96px" className={cn(!available && "opacity-60 grayscale")} />
            <PhotoEdge />
          </button>
        )}
        <button
          type="button"
          onClick={onAdd}
          disabled={!available}
          aria-label={choose ? `Elegir opciones de ${product.name}` : `Agregar ${product.name}`}
          className={cn(
            "flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_14px_-6px_var(--ink-fixed)] transition-transform hover:scale-105 active:scale-95 disabled:opacity-30",
            product.image_url ? "absolute -right-2 -bottom-3 ring-4 ring-background" : "mt-0.5",
          )}
        >
          <Plus className="size-5" strokeWidth={2.5} />
        </button>
      </div>
    </li>
  );
}
