"use client";

import { useState } from "react";
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
};

/** Carta interactiva: destacados, navegación por categoría, ficha, carrito y checkout. */
export function MenuView({ cafe, menu }: Props) {
  const cart = useCart(cafe.id);
  const openState = useOpenState(menu.hours, cafe.timezone);
  const [product, setProduct] = useState<MenuProduct | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const quickAdd = (p: MenuProduct) => {
    if (needsChoice(p)) return setProduct(p);
    cart.add({ product_id: p.id, name: p.name, unit_price: p.price, quantity: 1, options: [], notes: "" });
    toast(`Sumaste ${p.name}`, { duration: 1600 });
  };

  if (menu.categories.length === 0) {
    return (
      <p className="py-12 text-muted-foreground">
        La carta online todavía no está publicada.
        {cafe.address ? ` Mientras tanto, te esperamos en ${cafe.address}.` : ""}
      </p>
    );
  }

  // Destacados: lo primero de cada categoría que tenga foto y esté disponible.
  const featured = menu.categories
    .map((c) => c.products.find((p) => p.image_url && p.is_available))
    .filter((p): p is MenuProduct => p !== undefined)
    .slice(0, 6);

  return (
    <>
      {featured.length > 1 && (
        <section aria-labelledby="destacados" className="pt-8">
          <h2 id="destacados" className="text-heading font-bold">
            Lo más pedido
          </h2>
          <ul className="-mx-5 mt-4 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none]">
            {featured.map((p, i) => (
              <li key={p.id} className="w-[68%] shrink-0 snap-start sm:w-56">
                <button type="button" onClick={() => setProduct(p)} className="group block w-full text-left">
                  <span className="relative block aspect-[4/3] overflow-hidden rounded-xl bg-muted">
                    <ProductImage
                      src={p.image_url!}
                      sizes="(max-width: 640px) 68vw, 224px"
                      priority={i < 2}
                      className="transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  </span>
                  <span className="mt-2.5 flex items-baseline justify-between gap-2">
                    <span className="font-wide font-bold">{p.name}</span>
                    <span className="numeric text-sm font-semibold">{formatARS(p.price)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {menu.categories.length > 1 && (
        <nav
          aria-label="Categorías de la carta"
          className="sticky top-0 z-30 -mx-5 mt-8 border-b border-border bg-background/95 px-5 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        >
          <ul className="-mb-px flex gap-6 overflow-x-auto [scrollbar-width:none]">
            {menu.categories.map((c) => (
              <li key={c.id} className="shrink-0">
                <a
                  href={`#cat-${c.id}`}
                  className="block border-b-2 border-transparent py-3.5 text-[0.95rem] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground focus-visible:text-foreground"
                >
                  {c.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="pb-32">
        {menu.categories.map((c) => (
          <section key={c.id} id={`cat-${c.id}`} aria-labelledby={`h-${c.id}`} className="scroll-mt-14 pt-9">
            <h2 id={`h-${c.id}`} className="text-heading font-bold">
              {c.name}
            </h2>
            {c.description && <p className="mt-1 text-muted-foreground">{c.description}</p>}
            <ul className="mt-2">
              {c.products.map((p) => (
                <ProductRow key={p.id} product={p} onOpen={() => setProduct(p)} onAdd={() => quickAdd(p)} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {cart.count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setCheckoutOpen(true)}
            className="flex h-14 w-full items-center justify-between gap-3 rounded-xl bg-primary px-5 font-semibold text-primary-foreground shadow-[0_10px_30px_-12px_var(--tueste)] transition-opacity hover:opacity-95"
          >
            <span className="flex items-center gap-3">
              <span className="numeric flex size-7 items-center justify-center rounded-md bg-primary-foreground/15 text-sm">
                {cart.count}
              </span>
              Ver pedido
            </span>
            <span className="numeric">{formatARS(cart.subtotal)}</span>
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
  return (
    <li className="flex items-stretch gap-4 border-b border-border py-4 last:border-b-0">
      <button
        type="button"
        onClick={onOpen}
        disabled={!available}
        className="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
      >
        <span className={cn("block font-wide text-[1.0625rem] font-bold", !available && "text-muted-foreground")}>
          {product.name}
        </span>
        {product.description && (
          <span className="mt-1 line-clamp-2 block text-[0.95rem] leading-relaxed text-muted-foreground">
            {product.description}
          </span>
        )}
        <span className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="numeric font-semibold">{formatARS(product.price)}</span>
          {!available ? (
            <span className="text-sm text-muted-foreground">Se terminó por hoy</span>
          ) : (
            product.option_groups.length > 0 && (
              <span className="text-sm text-muted-foreground">
                {product.option_groups.map((g) => g.name).join(" y ")} a elección
              </span>
            )
          )}
        </span>
      </button>

      <div className="relative shrink-0">
        {product.image_url ? (
          <button
            type="button"
            onClick={onOpen}
            disabled={!available}
            tabIndex={-1}
            aria-hidden
            className="relative block size-24 overflow-hidden rounded-xl bg-muted"
          >
            <ProductImage src={product.image_url} sizes="96px" className={cn(!available && "grayscale opacity-60")} />
          </button>
        ) : (
          <div className="size-12" aria-hidden />
        )}
        <button
          type="button"
          onClick={onAdd}
          disabled={!available}
          aria-label={`Agregar ${product.name}`}
          className={cn(
            "flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-transform hover:scale-105 active:scale-95 disabled:opacity-30",
            product.image_url ? "absolute -right-1.5 -bottom-1.5 ring-4 ring-background" : "absolute top-0 right-0",
          )}
        >
          <Plus className="size-5" strokeWidth={2.5} />
        </button>
      </div>
    </li>
  );
}
