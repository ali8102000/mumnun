import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/google-maps";
import { Loader2 } from "lucide-react";

type Coords = { lat: number; lng: number };

/**
 * Read-only live map that shows two markers (me + other) and auto-fits bounds.
 */
export function LiveTrackMap({
  me,
  other,
  meColor = "#0284c7",
  otherColor = "#e11d48",
  height = 260,
}: {
  me: Coords | null;
  other: Coords | null;
  meColor?: string;
  otherColor?: string;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const meMarkerRef = useRef<any>(null);
  const otherMarkerRef = useRef<any>(null);
  const lineRef = useRef<any>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((g) => {
      if (cancelled || !ref.current) return;
      const center = me ?? other ?? { lat: 33.3152, lng: 44.3661 };
      const map = new g.maps.Map(ref.current, {
        center,
        zoom: 14,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
        clickableIcons: false,
      });
      mapRef.current = map;
      readyRef.current = true;
      apply();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function apply() {
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g || !map) return;

    const upsert = (
      cur: any | null,
      coords: Coords | null,
      color: string,
      label: string
    ) => {
      if (!coords) {
        if (cur) cur.setMap(null);
        return null;
      }
      const icon = {
        path: g.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: color,
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 3,
      };
      if (cur) {
        cur.setPosition(coords);
        return cur;
      }
      return new g.maps.Marker({ position: coords, map, icon, title: label });
    };

    meMarkerRef.current = upsert(meMarkerRef.current, me, meColor, "أنا");
    otherMarkerRef.current = upsert(otherMarkerRef.current, other, otherColor, "الطرف الآخر");

    // Line between
    if (me && other) {
      const path = [me, other];
      if (lineRef.current) lineRef.current.setPath(path);
      else
        lineRef.current = new g.maps.Polyline({
          path,
          map,
          geodesic: true,
          strokeColor: meColor,
          strokeOpacity: 0.6,
          strokeWeight: 3,
        });
    } else if (lineRef.current) {
      lineRef.current.setMap(null);
      lineRef.current = null;
    }

    // Fit bounds
    if (me && other) {
      const bounds = new g.maps.LatLngBounds();
      bounds.extend(me);
      bounds.extend(other);
      map.fitBounds(bounds, 80);
    } else if (me || other) {
      map.panTo((me ?? other)!);
    }
  }

  useEffect(() => {
    if (readyRef.current) apply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.lat, me?.lng, other?.lat, other?.lng]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-border" style={{ height }}>
      <div ref={ref} className="absolute inset-0" style={{ background: "#e5edf5" }} />
      {!me && !other && (
        <div className="absolute inset-0 grid place-items-center bg-white/60">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: meColor }} />
        </div>
      )}
    </div>
  );
}
