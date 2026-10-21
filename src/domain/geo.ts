export interface LatLng {
  lat: number;
  lng: number;
}

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Rough road-travel estimate used only when no routing provider is configured.
 * Assumes roads are ~1.4× the straight-line distance at an average 45 km/h, rounded up to 5 minutes.
 * Always presented to users as an estimate.
 */
export const ESTIMATE_ROAD_FACTOR = 1.4;
export const ESTIMATE_AVG_SPEED_KMH = 45;

export function estimateTravelMinutes(a: LatLng, b: LatLng): number {
  const km = haversineKm(a, b) * ESTIMATE_ROAD_FACTOR;
  const minutes = (km / ESTIMATE_AVG_SPEED_KMH) * 60;
  return Math.ceil(minutes / 5) * 5;
}
