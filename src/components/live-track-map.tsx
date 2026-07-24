import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/google-maps";
import { Loader2 } from "lucide-react";

type Coords = { lat: number; lng: number; heading?: number | null };

function haversineKm(a: Coords, b: Coords) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function bearingDeg(a: Coords, b: Coords) {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const λ1 = (a.lng * Math.PI) / 180;
  const λ2 = (b.lng * Math.PI) / 180;
  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

export function LiveTrackMap({
  me,
  other,
  meColor = "#0284c7",
  otherColor = "#e11d48",
  height = 260,
  follow = true,
}: {
  me: Coords | null;
  other: Coords | null;
  meColor?: string;
  otherColor?: string;
  height?: number;
  follow?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const meMarkerRef = useRef<any>(null);
  const otherMarkerRef = useRef<any>(null);
  const lineRef = useRef<any>(null);
  const readyRef = useRef(false);
  const didFitRef = useRef(false);

  const otherAnimRef = useRef<{
    from: Coords;
    to: Coords;
    startedAt: number;
    duration: number;
    raf: number | null;
    lastHeading: number;
  } | null>(null);

  const [distanceKm, setDistanceKm] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((g) => {
      if (cancelled || !ref.current) return;
      if (!g) return;
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
      apply(false);
    });
    return () => {
      cancelled = true;
      if (otherAnimRef.current?.raf) cancelAnimationFrame(otherAnimRef.current.raf);
      if (meMarkerRef.current) meMarkerRef.current.setMap(null);
      if (otherMarkerRef.current) otherMarkerRef.current.setMap(null);
      if (lineRef.current) lineRef.current.setMap(null);
      if (mapRef.current) { mapRef.current = null; }
      readyRef.current = false;
      didFitRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setMarkerPosition(marker: any, pos: Coords, heading: number | null) {
    if (!marker) return;
    marker.setPosition(pos);
    if (heading != null) {
      const icon = marker.getIcon();
      if (icon && typeof icon === "object") {
        marker.setIcon({ ...icon, rotation: heading });
      }
    }
  }

  function upsertDot(
    cur: any | null,
    coords: Coords | null,
    color: string,
    label: string,
    arrow: boolean
  ) {
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g || !map) return cur;
    if (!coords) {
      if (cur) cur.setMap(null);
      return null;
    }
    const icon = arrow
      ? {
          path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 5,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
          rotation: coords.heading ?? 0,
        }
      : {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        };
    if (cur) {
      cur.setPosition(coords);
      cur.setIcon(icon);
      return cur;
    }
    return new g.maps.Marker({ position: coords, map, icon, title: label, optimized: false });
  }

  function drawLine() {
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g || !map) return;
    if (me && other) {
      const path = [me, other];
      if (lineRef.current) lineRef.current.setPath(path);
      else
        lineRef.current = new g.maps.Polyline({
          path,
          map,
          geodesic: true,
          strokeColor: meColor,
          strokeOpacity: 0.5,
          strokeWeight: 3,
          icons: [
            {
              icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 },
              offset: "0",
              repeat: "14px",
            },
          ],
        });
    } else if (lineRef.current) {
      lineRef.current.setMap(null);
      lineRef.current = null;
    }
  }

  function apply(animate: boolean) {
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g || !map) return;

    meMarkerRef.current = upsertDot(meMarkerRef.current, me, meColor, "أنا", false);

    if (!other) {
      if (otherMarkerRef.current) otherMarkerRef.current.setMap(null);
      otherMarkerRef.current = null;
      if (otherAnimRef.current?.raf) cancelAnimationFrame(otherAnimRef.current.raf);
      otherAnimRef.current = null;
    } else {
      if (!otherMarkerRef.current) {
        otherMarkerRef.current = upsertDot(null, other, otherColor, "الطرف الآخر", true);
        otherAnimRef.current = null;
      } else if (animate) {
        const cur = otherMarkerRef.current.getPosition();
        const from: Coords = cur
          ? { lat: cur.lat(), lng: cur.lng() }
          : other;
        if (haversineKm(from, other) * 1000 < 2) {
          setMarkerPosition(otherMarkerRef.current, other, other.heading ?? null);
        } else {
          const heading =
            other.heading != null && !Number.isNaN(other.heading)
              ? other.heading
              : bearingDeg(from, other);
          if (otherAnimRef.current?.raf) cancelAnimationFrame(otherAnimRef.current.raf);
          otherAnimRef.current = {
            from,
            to: other,
            startedAt: performance.now(),
            duration: 1200,
            raf: null,
            lastHeading: heading,
          };
          const step = () => {
            const s = otherAnimRef.current;
            if (!s || !otherMarkerRef.current) return;
            const now = performance.now();
            const t = Math.min(1, (now - s.startedAt) / s.duration);
            const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            const lat = s.from.lat + (s.to.lat - s.from.lat) * e;
            const lng = s.from.lng + (s.to.lng - s.from.lng) * e;
            setMarkerPosition(otherMarkerRef.current, { lat, lng }, s.lastHeading);
            if (t < 1) {
              s.raf = requestAnimationFrame(step);
            } else {
              s.raf = null;
            }
          };
          otherAnimRef.current.raf = requestAnimationFrame(step);
        }
      } else {
        setMarkerPosition(otherMarkerRef.current, other, other.heading ?? null);
      }
    }

    drawLine();

    if (me && other) setDistanceKm(haversineKm(me, other));
    else setDistanceKm(null);

    if (me && other) {
      if (!didFitRef.current) {
        const bounds = new g.maps.LatLngBounds();
        bounds.extend(me);
        bounds.extend(other);
        map.fitBounds(bounds, 80);
        didFitRef.current = true;
      } else if (follow) {
        map.panTo({
          lat: (me.lat + other.lat) / 2,
          lng: (me.lng + other.lng) / 2,
        });
      }
    } else if (me || other) {
      map.panTo((me ?? other)!);
    }
  }

  useEffect(() => {
    if (readyRef.current) apply(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.lat, me?.lng, other?.lat, other?.lng, other?.heading, follow, meColor, otherColor]);

  const etaMin =
    distanceKm != null ? Math.max(1, Math.round((distanceKm / 30) * 60)) : null;

  return (
    <div className="relative rounded-2xl overflow-hidden border border-border" style={{ height }}>
      <div ref={ref} className="absolute inset-0" style={{ background: "#e5edf5" }} />
      {!me && !other && (
        <div className="absolute inset-0 grid place-items-center bg-white/60">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: meColor }} />
        </div>
      )}
      {distanceKm != null && (
        <div className="absolute top-2 left-2 rtl:left-auto rtl:right-2 bg-white/95 backdrop-blur px-3 py-1.5 rounded-full shadow-md text-[11px] font-bold flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>{distanceKm < 1 ? `${Math.round(distanceKm * 1000)} م` : `${distanceKm.toFixed(1)} كم`}</span>
          {etaMin != null && <span className="text-muted-foreground">· ~{etaMin} د</span>}
        </div>
      )}
    </div>
  );
}
