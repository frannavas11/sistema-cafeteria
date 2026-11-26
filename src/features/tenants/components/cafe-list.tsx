import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { getMyWorkplaces } from "../memberships";

const ROLE_LABEL = {
  admin: "Administración",
  receptionist: "Barra y recepción",
  driver: "Reparto",
} as const;

function homeFor(cafe: { role: keyof typeof ROLE_LABEL; slug: string }) {
  return cafe.role === "driver" ? "/driver" : `/admin/${cafe.slug}`;
}

/** Selector de lugar de trabajo. Lee la sesión: renderizar dentro de <Suspense>. */
export async function CafeList() {
  const userId = await requireUser("/admin");
  const { superAdmin, cafes, onlySuspended } = await getMyWorkplaces(userId);

  // Un solo lugar de trabajo: entrar directo (el driver va a su vista de una mano).
  if (!superAdmin && cafes.length === 1) redirect(homeFor(cafes[0]));

  if (!superAdmin && cafes.length === 0) {
    return (
      <p className="mt-6 max-w-prose text-muted-foreground">
        {onlySuspended
          ? "La cafetería donde trabajás está suspendida por ahora. Consultá con su administrador."
          : "Todavía no formás parte de ninguna cafetería. Pedile al administrador que te sume desde Staff."}
      </p>
    );
  }

  return (
    <ul className="mt-8 divide-y divide-border border-y border-border">
      {superAdmin && (
        <li>
          <Link href="/super-admin" className="flex items-baseline justify-between gap-4 py-5 hover:text-primary">
            <span className="text-lg font-semibold">Plataforma</span>
            <span className="text-sm text-muted-foreground">Cafeterías, planes y métricas</span>
          </Link>
        </li>
      )}
      {cafes.map((cafe) => (
        <li key={cafe.id}>
          <Link href={homeFor(cafe)} className="flex items-baseline justify-between gap-4 py-5 hover:text-primary">
            <span>
              <span className="block text-lg font-semibold">{cafe.name}</span>
              {cafe.address && <span className="text-sm text-muted-foreground">{cafe.address}</span>}
            </span>
            <span className="shrink-0 text-sm text-muted-foreground">{ROLE_LABEL[cafe.role]}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
