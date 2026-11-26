import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Wordmark } from "@/components/shell/wordmark";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { listPublicCafes } from "@/features/tenants/queries";
import { cafeThemeStyle } from "@/features/tenants/lib/theme";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-6">
      <header className="flex h-20 items-center justify-between">
        <Wordmark className="text-2xl" />
        <div className="flex items-center gap-2">
          <ThemeToggle compact />
          <Link href="/login" className={buttonVariants({ variant: "outline", size: "lg", className: "h-10 px-4" })}>
            Entrar
          </Link>
        </div>
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
    <ul className="mt-6 grid gap-4 sm:grid-cols-2">
      {cafes.map((c) => (
        <li key={c.id} style={cafeThemeStyle({ brand_color: c.brand_color })}>
          <Link
            href={`/${c.slug}`}
            className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary"
          >
            {c.cover_url && (
              <span className="relative block aspect-[16/9] overflow-hidden bg-muted">
                <Image
                  src={c.cover_url}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 100vw, 480px"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </span>
            )}
            <span className="flex items-end bg-primary px-5 py-4 text-primary-foreground">
              <span className="font-wide text-[1.75rem] leading-[0.95] font-extrabold tracking-[-0.03em]">
                {c.name}
              </span>
            </span>
            <span className="flex flex-1 flex-col px-5 py-4">
              {c.tagline && <span className="max-w-[40ch] text-foreground">{c.tagline}</span>}
              {c.address && <span className="mt-2 text-sm text-muted-foreground">{c.address}</span>}
              <span className="mt-4 text-sm font-semibold text-primary group-hover:underline">Ver la carta</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
