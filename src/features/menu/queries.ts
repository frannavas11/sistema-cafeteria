import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import type { MenuCategory, MenuProduct, StoreMenu } from "./types";

/**
 * Carta pública de una cafetería (cacheada; invalidar con `updateTag('menu:<cafeId>')`
 * al editar el menú). Todo pasa por RLS como visitante anónimo: sólo se ven
 * categorías y productos activos, y nunca `stock_qty`.
 */
export async function getStoreMenu(cafeId: string): Promise<StoreMenu> {
  "use cache";
  cacheTag(`menu:${cafeId}`);
  cacheLife("minutes");

  const supabase = createPublicClient();
  const [categories, products, groups, items, hours, zones] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, description")
      .eq("cafe_id", cafeId)
      .order("sort_order"),
    supabase
      .from("products")
      .select("id, category_id, name, description, price, image_url, is_available")
      .eq("cafe_id", cafeId)
      .order("sort_order"),
    supabase
      .from("product_option_groups")
      .select("id, product_id, name, min_select, max_select")
      .eq("cafe_id", cafeId)
      .order("sort_order"),
    supabase
      .from("product_option_items")
      .select("id, group_id, name, price_delta")
      .eq("cafe_id", cafeId)
      .eq("is_available", true)
      .order("sort_order"),
    supabase.from("cafe_hours").select("weekday, opens_at, closes_at").eq("cafe_id", cafeId),
    supabase
      .from("delivery_zones")
      .select(
        "id, name, zone_type, center_lat, center_lng, radius_km, polygon, fee, min_order, eta_minutes, priority",
      )
      .eq("cafe_id", cafeId)
      .eq("is_active", true),
  ]);

  const failed = [categories, products, groups, items, hours, zones].find((r) => r.error);
  if (failed?.error) throw new Error(`No se pudo leer la carta: ${failed.error.message}`);

  const byProduct = new Map<string, MenuProduct["option_groups"]>();
  for (const g of groups.data ?? []) {
    const list = byProduct.get(g.product_id) ?? [];
    list.push({
      id: g.id,
      name: g.name,
      min_select: g.min_select,
      max_select: g.max_select,
      items: (items.data ?? [])
        .filter((i) => i.group_id === g.id)
        .map(({ id, name, price_delta }) => ({ id, name, price_delta })),
    });
    byProduct.set(g.product_id, list);
  }

  const menuProducts: MenuProduct[] = (products.data ?? []).map((p) => ({
    ...p,
    option_groups: byProduct.get(p.id) ?? [],
  }));

  const menuCategories: MenuCategory[] = (categories.data ?? [])
    .map((c) => ({ ...c, products: menuProducts.filter((p) => p.category_id === c.id) }))
    .filter((c) => c.products.length > 0);

  const loose = menuProducts.filter((p) => p.category_id === null);
  if (loose.length > 0) {
    menuCategories.push({ id: "otros", name: "Más para pedir", description: null, products: loose });
  }

  return { categories: menuCategories, hours: hours.data ?? [], zones: zones.data ?? [] };
}
