import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/auth/guards";
import type { StaffRole } from "@/lib/auth/guards";

export type MyCafe = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  role: StaffRole;
};

export type MyWorkplaces = {
  superAdmin: boolean;
  cafes: MyCafe[];
  /** Tiene membresías, pero todas en cafés suspendidos. */
  onlySuspended: boolean;
};

/** Cafés donde trabaja el usuario actual (datos por usuario: nunca cachear con 'use cache'). */
export async function getMyWorkplaces(userId: string): Promise<MyWorkplaces> {
  const supabase = await createClient();

  // RLS: cada usuario sólo ve sus propias membresías.
  const [{ data: members }, superAdmin] = await Promise.all([
    supabase.from("cafe_members").select("role, cafe_id").eq("user_id", userId).eq("is_active", true),
    isSuperAdmin(),
  ]);

  const memberships = members ?? [];
  const cafeIds = memberships.map((m) => m.cafe_id);

  // RLS de cafes filtra los suspendidos.
  const { data: cafes } = cafeIds.length
    ? await supabase.from("cafes").select("id, name, slug, address").in("id", cafeIds).order("name")
    : { data: [] };

  const result: MyCafe[] = (cafes ?? []).flatMap((cafe) => {
    const role = memberships.find((m) => m.cafe_id === cafe.id)?.role;
    return role && role !== "super_admin" ? [{ ...cafe, role }] : [];
  });

  return {
    superAdmin,
    cafes: result,
    onlySuspended: memberships.length > 0 && result.length === 0,
  };
}
