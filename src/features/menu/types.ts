import type { Tables } from "@/types/supabase";

export type MenuOptionItem = Pick<Tables<"product_option_items">, "id" | "name" | "price_delta">;

export type MenuOptionGroup = Pick<
  Tables<"product_option_groups">,
  "id" | "name" | "min_select" | "max_select"
> & { items: MenuOptionItem[] };

/** Producto tal como lo ve el público: sin `stock_qty` (no es legible por API). */
export type MenuProduct = Pick<
  Tables<"products">,
  "id" | "category_id" | "name" | "description" | "price" | "image_url" | "is_available"
> & { option_groups: MenuOptionGroup[] };

export type MenuCategory = Pick<Tables<"categories">, "id" | "name" | "description"> & {
  products: MenuProduct[];
};

export type CafeHour = Pick<Tables<"cafe_hours">, "weekday" | "opens_at" | "closes_at">;

export type PublicZone = Pick<
  Tables<"delivery_zones">,
  | "id"
  | "name"
  | "zone_type"
  | "center_lat"
  | "center_lng"
  | "radius_km"
  | "polygon"
  | "fee"
  | "min_order"
  | "eta_minutes"
  | "priority"
>;

export type StoreMenu = {
  categories: MenuCategory[];
  hours: CafeHour[];
  zones: PublicZone[];
};

/** Un producto se agrega con un toque si no exige elegir opciones. */
export function needsChoice(product: MenuProduct): boolean {
  return product.option_groups.some((g) => g.min_select > 0);
}
