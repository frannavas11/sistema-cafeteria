import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Wordmark } from "@/components/shell/wordmark";
import { listPublicCafes } from "@/features/tenants/queries";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-6">
      <header className="flex h-20 items-center justify-between">
        <Wordmark className="text-2xl" />
        <Link href="/login" className={buttonVariants({ variant: "outline", size: "lg", className: "h-10 px-4" })}>
          Entrar
        </Link>
      </header>

      <section className="py-16 sm:py-24">
        <h1 className="max-w-[14ch] font-wide text-display font-extrabold">
          La barra, el mostrador y la moto, en el mismo pedido.
        </h1>
        <p className="mt-8 max-w-[46ch] text-[1.125rem] leading-relaxed text-muted-foreground">
          Tolva recibe los pedidos online de tu cafetería, cobra en el mostrador y sigue cada
          entrega en el mapa. Cada local con su carta, su equipo y sus zonas.
        </p>
      </section>

      <section aria-labelledby="cafes" className="border-t border-border pt-10 pb-20">
        <h2 id="cafes" className="text-heading font-bold">
          Pedí en una cafetería
        </h2>
        <Suspense fallback={<div className="mt-6 h-40 animate-pulse rounded-xl bg-muted" aria-hidden />}>
          <CafeDirectory />
        </Suspense>
      </section>
    </main>
  );
}

async function CafeDirectory() {
  const cafes = await listPublicCafes();
  if (cafes.length === 0) {
    return <p className="mt-4 text-muted-foreground">Todavía no hay cafeterías publicadas.</p>;
  }
  return (
    <ul className="mt-6 grid gap-x-10 sm:grid-cols-2">
      {cafes.map((c) => (
        <li key={c.id} className="border-b border-border">
          <Link href={`/${c.slug}`} className="group block py-6">
            <span className="block font-wide text-[1.5rem] leading-tight font-extrabold group-hover:text-cascara">
              {c.name}
            </span>
            {c.tagline && <span className="mt-2 block max-w-[40ch] text-muted-foreground">{c.tagline}</span>}
            {c.address && <span className="mt-3 block text-sm text-muted-foreground">{c.address}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
