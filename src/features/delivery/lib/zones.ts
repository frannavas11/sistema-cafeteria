import type { PublicZone } from "@/features/menu/types";

type LatLng = { lat: number; lng: number };

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Ray casting sobre el anillo exterior de un GeoJSON Polygon ([lng, lat]). */
function inPolygon(point: LatLng, polygon: unknown): boolean {
  const ring = (polygon as { coordinates?: number[][][] } | null)?.coordinates?.[0];
  if (!Array.isArray(ring)) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/**
 * Zona que cubriría el punto, con el mismo orden que `create_order`
 * (prioridad desc, fee asc). Sólo para mostrar el envío estimado: el costo
 * real lo calcula la base con PostGIS al confirmar.
 */
export function matchZone(zones: PublicZone[], point: LatLng): PublicZone | null {
  const hits = zones.filter((z) => {
    if (z.zone_type === "radius") {
      if (z.center_lat == null || z.center_lng == null || z.radius_km == null) return false;
      return haversineKm({ lat: z.center_lat, lng: z.center_lng }, point) <= z.radius_km;
    }
    return inPolygon(point, z.polygon);
  });
  hits.sort((a, b) => b.priority - a.priority || a.fee - b.fee);
  return hits[0] ?? null;
}
