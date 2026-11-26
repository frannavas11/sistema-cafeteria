import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getPublicCafe } from "@/features/tenants/queries";
import { cafeThemeStyle } from "@/features/tenants/lib/theme";

/** Tienda pública: mobile-first, con la marca de cada cafetería inyectada como tokens. */
export default function StoreLayout({ children, params }: LayoutProps<"/[slug]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <StoreTheme params={params}>{children}</StoreTheme>
    </Suspense>
  );
}

async function StoreTheme({
  children,
  params,
}: {
  children: React.ReactNode;
  params: LayoutProps<"/[slug]">["params"];
}) {
  const { slug } = await params;
  const cafe = await getPublicCafe(slug);
  if (!cafe) notFound();

  return (
    <div style={cafeThemeStyle(cafe.config)} className="min-h-dvh">
      {children}
    </div>
  );
}
