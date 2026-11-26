import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { getPublicCafe } from "@/features/tenants/queries";
import { getStoreMenu } from "@/features/menu/queries";
import { MenuView } from "@/features/menu/components/menu-view";
import { OpenBadge } from "@/features/menu/components/open-badge";
import { ProductImage } from "@/features/menu/components/product-image";
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

async function Store({ params }: Pick<PageProps<"/[slug]">, "params">) {
  const { slug } = await params;
  const cafe = await getPublicCafe(slug);
  if (!cafe) notFound();
  const menu = await getStoreMenu(cafe.id);
  const hero = menu.categories.flatMap((c) => c.products).find((p) => p.image_url && p.is_available);

  return (
    <>
      {/* Franja de la cafetería: el único lugar donde su color ocupa superficie. */}
      <header className="bg-primary text-primary-foreground">
        <div className="relative mx-auto max-w-xl px-5 pt-4 pb-10">
          <div className="flex items-center justify-between">
            <Link href="/" className="rounded-md text-lg opacity-80 hover:opacity-100" aria-label="Volver a Tolva">
              <Wordmark />
            </Link>
            <ThemeToggle
              compact
              className="border-primary-foreground/25 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground dark:border-primary-foreground/25 dark:bg-transparent dark:hover:bg-primary-foreground/10"
            />
          </div>

          <div className={hero ? "mt-10 pr-32 sm:pr-40" : "mt-10"}>
            <h1 className="font-wide text-[2.75rem] leading-[0.95] font-extrabold tracking-[-0.035em] sm:text-display">
              {cafe.name}
            </h1>
            {cafe.config.tagline && (
              <p className="mt-4 max-w-[32ch] text-[1.0625rem] leading-relaxed opacity-85">{cafe.config.tagline}</p>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
            <OpenBadge hours={menu.hours} timezone={cafe.timezone} acceptsOrders={cafe.accepts_orders} />
            {cafe.address && (
              <span className="inline-flex items-center gap-1.5 text-sm opacity-85">
                <MapPin className="size-4 shrink-0" aria-hidden />
                {cafe.address}
              </span>
            )}
          </div>

          {hero?.image_url && (
            <div className="absolute top-20 right-5 size-28 overflow-hidden rounded-full ring-4 ring-primary-foreground/20 sm:size-36">
              <ProductImage src={hero.image_url} sizes="144px" priority />
            </div>
          )}
        </div>
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
        />
      </main>
    </>
  );
}

function StoreSkeleton() {
  return (
    <div aria-hidden className="animate-pulse">
      <div className="h-72 bg-muted" />
      <div className="mx-auto max-w-xl space-y-6 px-5 pt-10">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-20 rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
