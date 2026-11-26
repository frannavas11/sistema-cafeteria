import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient, getCurrentUserId } from "@/lib/supabase/server";
import type { MemberRole, Tables } from "@/types/supabase";

/**
 * Data Access Layer de autorización. El proxy sólo verifica que haya sesión;
 * estos guards validan el ROL en cada layout y Server Action, y RLS es la
 * garantía final. Leen cookies → llamarlos dentro de <Suspense> o en Server Actions.
 */

export type StaffRole = Exclude<MemberRole, "super_admin">;
export type PanelRole = "admin" | "receptionist" | "super_admin";

export type CafeContext = {
  userId: string;
  cafe: Pick<Tables<"cafes">, "id" | "name" | "slug" | "config" | "accepts_orders" | "timezone">;
  role: PanelRole;
};

export async function requireUser(next?: string): Promise<string> {
  const userId = await getCurrentUserId();
  if (!userId) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return userId;
}

export const isSuperAdmin = cache(async (): Promise<boolean> => {
  const userId = await getCurrentUserId();
  if (!userId) return false;
  const supabase = await createClient();
  // RLS: el usuario sólo puede leer su propia fila de platform_admins.
  const { data } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
});

export async function requireSuperAdmin(): Promise<string> {
  const userId = await requireUser("/super-admin");
  if (!(await isSuperAdmin())) redirect("/sin-acceso");
  return userId;
}

/**
 * Exige que el usuario tenga alguno de `roles` (admin y/o receptionist) en la
 * cafetería `slug`, o sea super_admin. Las páginas sólo-admin deben pasar `["admin"]`.
 */
export const requireCafeRole = cache(
  async (
    slug: string,
    roles: ReadonlyArray<"admin" | "receptionist"> = ["admin", "receptionist"],
  ): Promise<CafeContext> => {
    const userId = await requireUser(`/admin/${slug}`);
    const supabase = await createClient();

    // RLS de cafes oculta los suspendidos: staff de un café suspendido cae en notFound.
    const [{ data: cafe }, superAdmin] = await Promise.all([
      supabase
        .from("cafes")
        .select("id, name, slug, config, accepts_orders, timezone")
        .eq("slug", slug)
        .maybeSingle(),
      isSuperAdmin(),
    ]);
    if (!cafe) notFound();
    if (superAdmin) return { userId, cafe, role: "super_admin" };

    const { data: member } = await supabase
      .from("cafe_members")
      .select("role")
      .eq("cafe_id", cafe.id)
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    const role = member?.role;
    if (role !== "admin" && role !== "receptionist") redirect("/sin-acceso");
    if (!roles.includes(role)) redirect("/sin-acceso");
    return { userId, cafe, role };
  },
);

/** Exige ser driver activo de al menos una cafetería ACTIVA. */
export async function requireDriver(): Promise<string> {
  const userId = await requireUser("/driver");
  const supabase = await createClient();
  const { data: memberships } = await supabase
    .from("cafe_members")
    .select("cafe_id")
    .eq("user_id", userId)
    .eq("role", "driver")
    .eq("is_active", true);

  const cafeIds = (memberships ?? []).map((m) => m.cafe_id);
  // La RLS de cafes ya filtra is_active: un café suspendido no cuenta.
  const { count } = cafeIds.length
    ? await supabase.from("cafes").select("id", { count: "exact", head: true }).in("id", cafeIds)
    : { count: 0 };
  if (!count) redirect("/sin-acceso");
  return userId;
}
