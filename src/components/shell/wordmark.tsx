import { cn } from "@/lib/utils";

/** Marca de la plataforma. "Tolva": la boca del molinillo por donde entra el grano. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-wide font-extrabold tracking-[-0.04em] leading-none", className)}>
      tolva
    </span>
  );
}
