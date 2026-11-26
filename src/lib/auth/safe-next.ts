/**
 * Evita open redirects: sólo rutas internas del mismo origen.
 * Rechaza `//host`, barras invertidas y caracteres de control (`/\t/evil.com`
 * se normaliza a `//evil.com` en el navegador).
 */
export function isSafeNext(next: string | null | undefined): next is string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return false;
  if (/[\u0000-\u001F\u007F\\]/.test(next)) return false;
  try {
    return new URL(next, "http://n").origin === "http://n";
  } catch {
    return false;
  }
}
