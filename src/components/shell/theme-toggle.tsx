"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Alterna porcelana (claro) y tueste (oscuro).
 * `compact`: sólo el ícono, para cabeceras sobre el color de la cafetería.
 */
export function ThemeToggle({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <Button
      variant="outline"
      size="lg"
      className={cn(compact ? "size-10 px-0" : "h-10 gap-2 px-3", className)}
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
    >
      <Sun className="hidden size-4 dark:block" aria-hidden />
      <Moon className="size-4 dark:hidden" aria-hidden />
      {!compact && (
        <>
          <span className="dark:hidden">Modo tueste</span>
          <span className="hidden dark:inline">Modo porcelana</span>
        </>
      )}
    </Button>
  );
}
