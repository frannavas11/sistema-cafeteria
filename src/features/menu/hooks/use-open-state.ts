"use client";

import { useSyncExternalStore } from "react";
import { getOpenState, type OpenState } from "../lib/hours";
import type { CafeHour } from "../types";

const MINUTE = 60_000;
const subscribe = (cb: () => void) => {
  const id = setInterval(cb, MINUTE);
  return () => clearInterval(id);
};
// Minuto actual como snapshot estable (cambia una vez por minuto).
const getSnapshot = () => Math.floor(Date.now() / MINUTE);
const getServerSnapshot = () => null;

/**
 * Estado abierto/cerrado calculado en el navegador (el servidor no conoce la hora
 * del visitante en el render cacheado). `null` hasta hidratar.
 */
export function useOpenState(hours: CafeHour[], timezone: string): OpenState | null {
  const minute = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return minute === null ? null : getOpenState(hours, timezone, new Date(minute * MINUTE));
}
