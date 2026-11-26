import { Suspense } from "react";
import { Wordmark } from "@/components/shell/wordmark";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireDriver } from "@/lib/auth/guards";

/** Vista móvil ligera para repartidores. */
export default function DriverLayout({ children }: LayoutProps<"/driver">) {
  return (
    <Suspense fallback={<Skeleton className="m-4 h-32" />}>
      <DriverShell>{children}</DriverShell>
    </Suspense>
  );
}

async function DriverShell({ children }: { children: React.ReactNode }) {
  await requireDriver();
  return (
    <div className="mx-auto min-h-dvh max-w-md">
      <header className="flex h-14 items-center justify-between px-4">
        <Wordmark className="text-lg" />
        <SignOutButton className="hover:bg-muted" />
      </header>
      {children}
    </div>
  );
}
