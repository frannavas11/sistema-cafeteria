"use client";

/** Hora en la zona del visitante (el cliente está en la misma ciudad que el café). */
export function LocalTime({ iso, className }: { iso: string; className?: string }) {
  const text = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}
