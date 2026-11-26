import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Plataforma" };

export default function SuperAdminPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-title font-bold">Cafeterías</h1>
      <Suspense fallback={<Skeleton className="mt-8 h-48" />}>
        <CafesTable />
      </Suspense>
    </main>
  );
}

async function CafesTable() {
  await requireSuperAdmin();
  const supabase = await createClient();
  // RLS: super_admin ve todos los cafés, incluidos los suspendidos.
  const { data: cafes } = await supabase
    .from("cafes")
    .select("id, name, slug, is_active, created_at")
    .order("created_at", { ascending: false });

  if (!cafes?.length) {
    return <p className="mt-8 text-muted-foreground">Todavía no hay cafeterías. Creá la primera.</p>;
  }

  return (
    <table className="mt-8 w-full text-left text-[0.9375rem]">
      <thead className="text-sm text-muted-foreground">
        <tr className="border-b border-border">
          <th className="py-3 font-medium">Nombre</th>
          <th className="py-3 font-medium">Dirección web</th>
          <th className="py-3 font-medium">Estado</th>
        </tr>
      </thead>
      <tbody>
        {cafes.map((cafe) => (
          <tr key={cafe.id} className="border-b border-border">
            <td className="py-4 font-semibold">
              <Link href={`/admin/${cafe.slug}`} className="hover:text-primary">
                {cafe.name}
              </Link>
            </td>
            <td className="py-4 text-muted-foreground">/{cafe.slug}</td>
            <td className="py-4">
              {cafe.is_active ? (
                <span className="text-status-ready">Activa</span>
              ) : (
                <span className="text-status-cancelled">Suspendida</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
