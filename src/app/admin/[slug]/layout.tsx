import { Suspense } from "react";
import Link from "next/link";
import { AdminNav } from "@/components/shell/admin-nav";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { Wordmark } from "@/components/shell/wordmark";
import { Skeleton } from "@/components/ui/skeleton";
import { requireCafeRole } from "@/lib/auth/guards";
import { cafeThemeStyle } from "@/features/tenants/lib/theme";
import { parseCafeConfig } from "@/features/tenants/types";

const ROLE_LABEL = { admin: "Administración", receptionist: "Barra", super_admin: "Plataforma" } as const;

export default function AdminCafeLayout({ children, params }: LayoutProps<"/admin/[slug]">) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <AdminShell params={params}>{children}</AdminShell>
    </Suspense>
  );
}

async function AdminShell({
  children,
  params,
}: {
  children: React.ReactNode;
  params: LayoutProps<"/admin/[slug]">["params"];
}) {
  const { slug } = await params;
  // Guard: membresía admin/receptionist en ESTE café (o super_admin). Si no, redirige.
  const { cafe, role } = await requireCafeRole(slug);
  const config = parseCafeConfig(cafe.config);

  return (
    <div
      data-density="compact"
      style={cafeThemeStyle(config)}
      className="grid min-h-dvh md:grid-cols-[15.5rem_1fr]"
    >
      <aside className="flex flex-col gap-8 bg-sidebar px-3 py-5 text-sidebar-foreground md:sticky md:top-0 md:h-dvh">
        <div className="px-3">
          <Link href="/admin" className="text-sidebar-foreground/60 hover:text-sidebar-foreground">
            <Wordmark className="text-base" />
          </Link>
          <p className="mt-5 font-wide text-xl font-bold leading-tight text-sidebar-accent-foreground">
            {cafe.name}
          </p>
          <p className="mt-1 text-[0.8125rem] text-sidebar-foreground/60">{ROLE_LABEL[role]}</p>
        </div>
        <AdminNav slug={cafe.slug} role={role} />
        <div className="mt-auto px-0 text-sidebar-foreground/70">
          <SignOutButton />
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ShellFallback() {
  return (
    <div className="grid min-h-dvh md:grid-cols-[15.5rem_1fr]">
      <aside className="bg-sidebar" />
      <div className="p-8">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-6 h-40" />
      </div>
    </div>
  );
}
