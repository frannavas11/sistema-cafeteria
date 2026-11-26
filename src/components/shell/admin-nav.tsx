"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  Coffee,
  MapPinned,
  Settings2,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: ReadonlyArray<"admin" | "receptionist" | "super_admin">;
  /** Ruta aún no construida (fases siguientes). */
  soon?: boolean;
};

const ITEMS = (slug: string): NavItem[] => [
  { href: `/admin/${slug}`, label: "Pedidos", icon: ClipboardList, roles: ["admin", "receptionist", "super_admin"] },
  { href: `/admin/${slug}/pos`, label: "Mostrador", icon: Store, roles: ["admin", "receptionist", "super_admin"], soon: true },
  { href: `/admin/${slug}/carta`, label: "Carta y stock", icon: Coffee, roles: ["admin", "super_admin"], soon: true },
  { href: `/admin/${slug}/zonas`, label: "Zonas de envío", icon: MapPinned, roles: ["admin", "super_admin"], soon: true },
  { href: `/admin/${slug}/staff`, label: "Staff", icon: Users, roles: ["admin", "super_admin"], soon: true },
  { href: `/admin/${slug}/ajustes`, label: "Ajustes", icon: Settings2, roles: ["admin", "super_admin"], soon: true },
];

export function AdminNav({
  slug,
  role,
}: {
  slug: string;
  role: "admin" | "receptionist" | "super_admin";
}) {
  const pathname = usePathname();
  const items = ITEMS(slug).filter((item) => item.roles.includes(role));

  return (
    <nav aria-label="Secciones" className="grid gap-0.5">
      {items.map(({ href, label, icon: Icon, soon }) => {
        const active = pathname === href;
        const base =
          "flex min-h-tap items-center gap-3 rounded-lg px-3 text-[0.9375rem] transition-colors";
        if (soon) {
          return (
            <span
              key={href}
              aria-disabled
              className={cn(base, "cursor-default text-sidebar-foreground/40")}
            >
              <Icon className="size-[1.125rem]" aria-hidden />
              {label}
              <span className="ml-auto text-[0.6875rem] text-sidebar-foreground/40">pronto</span>
            </span>
          );
        }
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              base,
              active
                ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className={cn("size-[1.125rem]", active && "text-sidebar-primary")} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
