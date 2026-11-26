import { Suspense } from "react";
import Link from "next/link";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { Wordmark } from "@/components/shell/wordmark";
import { Skeleton } from "@/components/ui/skeleton";
import { requireSuperAdmin } from "@/lib/auth/guards";

export default function SuperAdminLayout({ children }: LayoutProps<"/super-admin">) {
  return (
    <Suspense fallback={<Skeleton className="m-8 h-40" />}>
      <SuperAdminShell>{children}</SuperAdminShell>
    </Suspense>
  );
}

async function SuperAdminShell({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-loza">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
          <Link href="/super-admin">
            <Wordmark className="text-xl" />
          </Link>
          <span className="text-sm text-muted-foreground">Plataforma</span>
          <SignOutButton className="ml-auto hover:bg-muted" />
        </div>
      </header>
      {children}
    </div>
  );
}
