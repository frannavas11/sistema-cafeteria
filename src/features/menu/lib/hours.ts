import type { CafeHour } from "../types";

export type OpenState =
  | { open: true; closesAt: string }
  | { open: false; opensAt: string | null; opensDay: "hoy" | "mañana" | string | null };

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const short = (t: string) => t.slice(0, 5);

/** Día de semana (0 = domingo) y minutos del día en la zona horaria del café. */
function localNow(timezone: string, now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { dow, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/**
 * Espejo de `private.is_cafe_open_now` para mostrar el estado en la tienda.
 * Es sólo informativo: la base vuelve a validar el horario al crear el pedido.
 * Sin horarios cargados = abierto siempre.
 */
export function getOpenState(hours: CafeHour[], timezone: string, now = new Date()): OpenState {
  if (hours.length === 0) return { open: true, closesAt: "" };
  const { dow, minutes } = localNow(timezone, now);
  const yesterday = (dow + 6) % 7;

  for (const h of hours) {
    const o = toMinutes(h.opens_at);
    const c = toMinutes(h.closes_at);
    if (o < c && h.weekday === dow && minutes >= o && minutes < c) {
      return { open: true, closesAt: short(h.closes_at) };
    }
    if (o > c && h.weekday === dow && minutes >= o) return { open: true, closesAt: short(h.closes_at) };
    if (o > c && h.weekday === yesterday && minutes < c) return { open: true, closesAt: short(h.closes_at) };
  }

  // Próxima apertura dentro de los próximos 7 días.
  for (let offset = 0; offset < 7; offset++) {
    const day = (dow + offset) % 7;
    const next = hours
      .filter((h) => h.weekday === day && (offset > 0 || toMinutes(h.opens_at) > minutes))
      .sort((a, b) => toMinutes(a.opens_at) - toMinutes(b.opens_at))[0];
    if (next) {
      const opensDay = offset === 0 ? "hoy" : offset === 1 ? "mañana" : `el ${WEEKDAYS[day]}`;
      return { open: false, opensAt: short(next.opens_at), opensDay };
    }
  }
  return { open: false, opensAt: null, opensDay: null };
}
