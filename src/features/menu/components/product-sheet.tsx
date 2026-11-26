"use client";

import { useState } from "react";
import { ProductImage } from "./product-image";
import { Drawer } from "vaul";
import { Check, Minus, Plus } from "lucide-react";
import { formatARS } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CartLine } from "@/features/orders/hooks/use-cart";
import type { MenuOptionItem, MenuProduct } from "../types";

const NOTES_MAX = 200;

function initialSelection(product: MenuProduct): Record<string, string[]> {
  // Grupo obligatorio de una sola opción: se elige solo. Si no, la primera opción sin
  // recargo de un grupo "elegí 1" (la leche entera, el tamaño chico) ya viene marcada.
  return Object.fromEntries(
    product.option_groups.map((g) => {
      if (g.min_select >= 1 && g.max_select === 1) {
        const base = g.items.find((i) => i.price_delta === 0) ?? (g.items.length === 1 ? g.items[0] : null);
        return [g.id, base ? [base.id] : []];
      }
      return [g.id, []];
    }),
  );
}

export function ProductSheet({
  product,
  onClose,
  onAdd,
}: {
  product: MenuProduct | null;
  onClose: () => void;
  onAdd: (line: Omit<CartLine, "key">) => void;
}) {
  return (
    <Drawer.Root open={product !== null} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-tueste/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] max-w-xl flex-col rounded-t-2xl bg-card outline-none">
          {product && <ProductForm key={product.id} product={product} onAdd={onAdd} onClose={onClose} />}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function ProductForm({
  product,
  onAdd,
  onClose,
}: {
  product: MenuProduct;
  onAdd: (line: Omit<CartLine, "key">) => void;
  onClose: () => void;
}) {
  const [selection, setSelection] = useState(() => initialSelection(product));
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  const chosen: MenuOptionItem[] = product.option_groups.flatMap((g) =>
    g.items.filter((i) => selection[g.id]?.includes(i.id)),
  );
  const missing = product.option_groups.filter((g) => (selection[g.id]?.length ?? 0) < g.min_select);
  const unit = product.price + chosen.reduce((n, i) => n + i.price_delta, 0);

  const toggle = (groupId: string, itemId: string, max: number) =>
    setSelection((prev) => {
      const current = prev[groupId] ?? [];
      if (max === 1) return { ...prev, [groupId]: [itemId] };
      if (current.includes(itemId)) return { ...prev, [groupId]: current.filter((id) => id !== itemId) };
      if (current.length >= max) return prev;
      return { ...prev, [groupId]: [...current, itemId] };
    });

  const add = () => {
    if (missing.length > 0) return;
    onAdd({
      product_id: product.id,
      name: product.name,
      unit_price: unit,
      quantity,
      options: chosen.map(({ id, name, price_delta }) => ({ id, name, price_delta })),
      notes: notes.trim(),
    });
    onClose();
  };

  return (
    <>
      <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-border" aria-hidden />
      <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
        {product.image_url && (
          <div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-xl bg-muted">
            <ProductImage src={product.image_url} sizes="(max-width: 640px) 100vw, 576px" priority />
          </div>
        )}
        <Drawer.Title className="mt-5 font-wide text-heading font-extrabold">{product.name}</Drawer.Title>
        <Drawer.Description className={product.description ? "mt-2 leading-relaxed text-muted-foreground" : "sr-only"}>
          {product.description ?? `Opciones de ${product.name}`}
        </Drawer.Description>
        <p className="numeric mt-3 text-lg font-semibold">{formatARS(product.price)}</p>

        {product.option_groups.map((group) => {
          const single = group.max_select === 1;
          const rule =
            group.min_select > 0
              ? single
                ? "Elegí una"
                : `Elegí entre ${group.min_select} y ${group.max_select}`
              : single
                ? "Opcional"
                : `Opcional, hasta ${group.max_select}`;
          return (
            <fieldset key={group.id} className="mt-7">
              <legend className="flex w-full items-baseline justify-between gap-3">
                <span className="font-semibold">{group.name}</span>
                <span className="text-sm text-muted-foreground">{rule}</span>
              </legend>
              <div className="mt-2 divide-y divide-border border-y border-border">
                {group.items.map((item) => {
                  const on = selection[group.id]?.includes(item.id) ?? false;
                  return (
                    <label key={item.id} className="flex min-h-tap cursor-pointer items-center gap-3 py-2.5">
                      <input
                        type={single ? "radio" : "checkbox"}
                        name={`g-${group.id}`}
                        checked={on}
                        onChange={() => toggle(group.id, item.id, group.max_select)}
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center border-[1.5px] transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
                          single ? "rounded-full" : "rounded-[5px]",
                          on ? "border-primary bg-primary text-primary-foreground" : "border-input",
                        )}
                      >
                        {on && (single ? <span className="size-2 rounded-full bg-current" /> : <Check className="size-3.5" strokeWidth={3} />)}
                      </span>
                      <span className={cn("flex-1", on && "font-medium")}>{item.name}</span>
                      {item.price_delta > 0 && (
                        <span className="numeric text-sm text-muted-foreground">+{formatARS(item.price_delta)}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        <label htmlFor="product-notes" className="mt-7 block font-semibold">
          Aclaración para la barra
        </label>
        <textarea
          id="product-notes"
          rows={2}
          maxLength={NOTES_MAX}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Bien caliente, sin azúcar, en taza para llevar…"
          className="mt-2 w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      <div className="shrink-0 border-t border-border px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {missing.length > 0 && (
          <p className="mb-2 text-sm text-muted-foreground">Falta elegir {missing.map((g) => g.name.toLowerCase()).join(" y ")}.</p>
        )}
        <div className="flex items-center gap-3">
          <Stepper value={quantity} onChange={setQuantity} label={product.name} />
          <button
            type="button"
            onClick={add}
            disabled={missing.length > 0}
            className="flex h-13 flex-1 items-center justify-between rounded-xl bg-primary px-5 font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <span>Agregar</span>
            <span className="numeric">{formatARS(unit * quantity)}</span>
          </button>
        </div>
      </div>
    </>
  );
}

export function Stepper({
  value,
  onChange,
  label,
  min = 1,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  min?: number;
}) {
  return (
    <div className="flex h-13 items-center rounded-xl border border-border bg-background">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label={`Uno menos de ${label}`}
        className="flex h-full w-11 items-center justify-center rounded-l-xl disabled:opacity-30"
      >
        <Minus className="size-4" />
      </button>
      <span className="numeric w-6 text-center font-semibold" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= 100}
        aria-label={`Uno más de ${label}`}
        className="flex h-full w-11 items-center justify-center rounded-r-xl disabled:opacity-30"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
