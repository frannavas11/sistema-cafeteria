import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Wordmark } from "@/components/shell/wordmark";
import { CafeList } from "@/features/tenants/components/cafe-list";

export const metadata: Metadata = { title: "Mis cafeterías" };

export default function AdminIndexPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <Wordmark className="text-2xl" />
      <h1 className="mt-12 text-title font-bold">Elegí dónde trabajar hoy</h1>
      <Suspense
        fallback={
          <div className="mt-8 grid gap-4">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        }
      >
        <CafeList />
      </Suspense>
    </main>
  );
}
