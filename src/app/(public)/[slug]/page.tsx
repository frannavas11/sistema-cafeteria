import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { getPublicCafe } from "@/features/tenants/queries";
import { getStoreMenu } from "@/features/menu/queries";
import { MenuView } from "@/features/menu/components/menu-view";
import { OpenBadge } from "@/features/menu/components/open-badge";
import { StoreTicket } from "@/features/menu/components/store-ticket";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Wordmark } from "@/components/shell/wordmark";

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const cafe = await getPublicCafe(slug);
  return cafe
    ? { title: cafe.name, description: cafe.config.tagline }
    : { title: "Cafetería no encontrada" };
}

export default function StorePage({ params }: PageProps<"/[slug]">) {
  return (
    <Suspense fallback={<StoreSkeleton />}>
      <Store params={params} />
    </Suspense>
  );
}

const chrome =
  "border-transparent bg-ink/45 text-paper backdrop-blur-md hover:bg-ink/60 hover:text-paper dark:border-transparent dark:bg-ink/45 dark:hover:bg-ink/60";

async function Store({ params }: Pick<PageProps<"/[slug]">, "params">) {
  const { slug } = await params;
  const cafe = await getPublicCafe(slug);
  if (!cafe) notFound();
  const menu = await getStoreMenu(cafe.id);
  const cover = cafe.config.cover_url;

  return (
    <>
      {/* Portada: la foto del local y, debajo, su cartel como un toldo en el color del café. */}
      <div className="relative">
        <div className={cover ? "relative h-[38vh] min-h-60 max-h-[420px] bg-ink" : "h-18 bg-band"}>
          {cover && (
            <Image src={cover} alt="" fill priority sizes="100vw" className="object-cover" />
          )}
        </div>
        <div className="absolute inset-x-0 top-0 mx-auto flex max-w-xl items-center justify-between px-4 pt-4">
          <Link
            href="/"
            aria-label="Volver a Tolva"
            className={`inline-flex h-10 items-center rounded-lg px-3 text-[1.05rem] ${chrome}`}
          >
            <Wordmark />
          </Link>
          <ThemeToggle compact className={chrome} />
        </div>
      </div>

      <header className="bg-band text-band-fg">
        <div className="mx-auto max-w-xl px-5 pt-7 pb-7">
          <h1 className="font-wide text-[clamp(2.75rem,12.5vw,4rem)] leading-[0.88] font-extrabold tracking-[-0.04em]">
            {cafe.name}
          </h1>
          {cafe.config.tagline && (
            <p className="mt-4 max-w-[30ch] text-[1.125rem] leading-snug italic">{cafe.config.tagline}</p>
          )}
          <div className="mt-6 border-t border-current/25 pt-4 text-[0.95rem]">
            <OpenBadge hours={menu.hours} timezone={cafe.timezone} acceptsOrders={cafe.accepts_orders} />
            {cafe.address && (
              <a
                href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(cafe.address)}`}
                target="_blank"
                rel="noreferrer"
                className="-mx-1 mt-1 flex min-h-tap items-center gap-2.5 rounded-md px-1 underline decoration-current/40 underline-offset-4 hover:decoration-current focus-visible:outline-current"
              >
                <MapPin className="size-4 shrink-0" aria-hidden />
                <span>
                  {cafe.address}
                  <span className="sr-only"> (abre el mapa en otra pestaña)</span>
                </span>
              </a>
            )}
          </div>
        </div>
        <RoastStrip />
      </header>

      <main className="mx-auto max-w-xl px-5">
        <MenuView
          cafe={{
            id: cafe.id,
            name: cafe.name,
            address: cafe.address,
            acceptsOrders: cafe.accepts_orders,
            timezone: cafe.timezone,
          }}
          menu={menu}
          footer={<StoreTicket name={cafe.name} address={cafe.address} hours={menu.hours} />}
        />
      </main>
    </>
  );
}

/** La curva de tueste como borde inferior del cartel: del grano verde al full city. */
function RoastStrip() {
  return (
    <div aria-hidden className="grid h-1.5 grid-cols-5">
      <span className="bg-roast-0" />
      <span className="bg-roast-1" />
      <span className="bg-roast-2" />
      <span className="bg-roast-3" />
      <span className="bg-roast-4" />
    </div>
  );
}

function StoreSkeleton() {
  return (
    <div aria-hidden className="animate-pulse">
      <div className="h-[38vh] min-h-60 max-h-[420px] bg-muted" />
      <div className="h-56 bg-secondary" />
      <div className="mx-auto max-w-xl px-5 pt-10">
        <div className="h-7 w-44 rounded-md bg-muted" />
        <div className="mt-5 flex gap-3">
          <div className="aspect-[4/5] w-[64%] shrink-0 rounded-xl bg-muted" />
          <div className="aspect-[4/5] w-[30%] shrink-0 rounded-xl bg-muted" />
        </div>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="mt-8 flex gap-4">
            <div className="flex-1 space-y-2.5 pt-1">
              <div className="h-4 w-3/4 rounded bg-muted" />
              <div className="h-3.5 w-full rounded bg-muted" />
              <div className="h-3.5 w-2/3 rounded bg-muted" />
            </div>
            <div className="size-24 rounded-xl bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
