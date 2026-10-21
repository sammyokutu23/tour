"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { cn } from "@/components/ui";

export interface MapMarker {
  lat: number;
  lng: number;
  label: string;
  kind?: "destination" | "experience" | "meeting" | "guide";
  href?: string;
  order?: number;
}

/**
 * Map abstraction. Uses Mapbox raster tiles when NEXT_PUBLIC_MAPBOX_TOKEN is set, otherwise
 * OpenStreetMap tiles (suitable for development/low volume only; see docs/integrations.md).
 * Lines drawn between stops are straight connectors, never presented as road routes.
 */
export function TripMap({
  markers,
  connect = false,
  className,
  ariaLabel = "Map",
  zoom,
}: {
  markers: MapMarker[];
  connect?: boolean;
  className?: string;
  ariaLabel?: string;
  zoom?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const key = JSON.stringify(markers) + connect;

  useEffect(() => {
    let disposed = false;
    let map: import("leaflet").Map | undefined;
    (async () => {
      try {
        const L = await import("leaflet");
        if (disposed || !ref.current) return;
        map = L.map(ref.current, { scrollWheelZoom: false, attributionControl: true });
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
        if (token) {
          L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/{z}/{x}/{y}?access_token=${token}`, {
            tileSize: 512,
            zoomOffset: -1,
            maxZoom: 18,
            attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          }).addTo(map);
        } else {
          L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 18,
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          }).addTo(map);
        }
        const colors: Record<string, string> = { destination: "#163D32", experience: "#D96C43", meeting: "#D96C43", guide: "#C99A2C" };
        const points: [number, number][] = [];
        for (const m of markers) {
          const color = colors[m.kind ?? "destination"];
          const icon = L.divIcon({
            className: "",
            html: `<div style="background:${color};color:#F6F1E8;border:2px solid #F6F1E8;box-shadow:0 2px 6px rgba(0,0,0,.3);width:28px;height:28px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font:700 12px/1 system-ui">${m.order ?? ""}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
          const marker = L.marker([m.lat, m.lng], { icon, title: m.label, alt: m.label, keyboard: true }).addTo(map);
          const safe = m.label.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
          marker.bindPopup(m.href ? `<a href="${encodeURI(m.href)}" style="font-weight:600;color:#163D32">${safe}</a>` : `<strong>${safe}</strong>`);
          points.push([m.lat, m.lng]);
        }
        if (connect && points.length > 1) {
          L.polyline(points, { color: "#163D32", weight: 2.5, dashArray: "6 8", opacity: 0.8 }).addTo(map);
        }
        if (points.length === 1) map.setView(points[0], zoom ?? 10);
        else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: zoom ?? 12 });
        else map.setView([0.0236, 37.9062], 6);
      } catch {
        if (!disposed) setFailed(true);
      }
    })();
    return () => {
      disposed = true;
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-render the map only when its data changes
  }, [key]);

  if (failed) {
    return (
      <div className={cn("flex items-center justify-center rounded-2xl bg-forest-50 p-6 text-center text-sm text-ink-muted", className)}>
        The map couldn&apos;t load. Locations: {markers.map((m) => m.label).join(", ") || "none"}.
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden rounded-2xl bg-forest-50", className)}>
      <div ref={ref} role="region" aria-label={ariaLabel} className="absolute inset-0" />
      {connect && markers.length > 1 && (
        <p className="pointer-events-none absolute bottom-2 left-2 z-[400] rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-ink-muted">
          Dashed lines show order of stops, not road routes
        </p>
      )}
    </div>
  );
}
