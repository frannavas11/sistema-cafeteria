"use client";

import { useEffect } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist } from "zustand/middleware";

export type CartOption = { id: string; name: string; price_delta: number };

export type CartLine = {
  /** Clave estable: producto + opciones + nota. Dos agregados iguales suman cantidad. */
  key: string;
  product_id: string;
  name: string;
  /** Precio unitario mostrado. El servidor lo recalcula: nunca se envía. */
  unit_price: number;
  quantity: number;
  options: CartOption[];
  notes: string;
};

type CartState = {
  lines: CartLine[];
  add: (line: Omit<CartLine, "key">) => void;
  setQuantity: (key: string, quantity: number) => void;
  clear: () => void;
};

const MAX_QTY = 100;

const lineKey = (productId: string, options: CartOption[], notes: string) =>
  [productId, options.map((o) => o.id).sort().join("+"), notes.trim().toLowerCase()].join("|");

function makeStore(cafeId: string) {
  return createStore<CartState>()(
    persist(
      (set) => ({
        lines: [],
        add: (line) =>
          set((s) => {
            const key = lineKey(line.product_id, line.options, line.notes);
            if (s.lines.some((l) => l.key === key)) {
              return {
                lines: s.lines.map((l) =>
                  l.key === key ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + line.quantity) } : l,
                ),
              };
            }
            return { lines: [...s.lines, { ...line, key }] };
          }),
        setQuantity: (key, quantity) =>
          set((s) => ({
            lines:
              quantity <= 0
                ? s.lines.filter((l) => l.key !== key)
                : s.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(MAX_QTY, quantity) } : l)),
          })),
        clear: () => set({ lines: [] }),
      }),
      {
        name: `tolva-cart-${cafeId}`,
        storage: createJSONStorage(() => localStorage),
        // Se rehidrata después del primer render para no romper la hidratación de React.
        skipHydration: true,
      },
    ),
  );
}

const stores = new Map<string, ReturnType<typeof makeStore>>();

/** Un carrito por cafetería, persistido en localStorage. */
function cartStore(cafeId: string) {
  let store = stores.get(cafeId);
  if (!store) {
    store = makeStore(cafeId);
    stores.set(cafeId, store);
  }
  return store;
}

export function useCart(cafeId: string) {
  const store = cartStore(cafeId);
  useEffect(() => {
    if (!store.persist.hasHydrated()) void store.persist.rehydrate();
  }, [store]);

  const lines = useStore(store, (s) => s.lines);
  const add = useStore(store, (s) => s.add);
  const setQuantity = useStore(store, (s) => s.setQuantity);
  const clear = useStore(store, (s) => s.clear);
  const count = lines.reduce((n, l) => n + l.quantity, 0);
  const subtotal = lines.reduce((n, l) => n + l.unit_price * l.quantity, 0);
  return { lines, add, setQuantity, clear, count, subtotal };
}
