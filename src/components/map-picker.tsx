import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/google-maps";
import { Loader2, MapPin, Crosshair } from "lucide-react";

type Coords = { lat: number; lng: number };

const DEFAULT_CENTER: Coords = { lat: 33.3152, lng: 44.3661 }; // Baghdad

export function MapPicker({
  value,
  onChange,
  height = 260,
  accent = "#0ea5e9",
}: {
  value: Coords | null;
  onChange: (c: Coords, address?: string) => void;
  height?: number;
  accent?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !containerRef.current) return;
        const center = value ?? DEFAULT_CENTER;
        const map = new g.maps.Map(containerRef.current, {
          center,
          zoom: value ? 16 : 12,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          clickableIcons: false,
        });
        const marker = new g.maps.Marker({
          position: center,
          map,
          draggable: true,
        });
        const geocoder = new g.maps.Geocoder();
        mapRef.current = map;
        markerRef.current = marker;
        geocoderRef.current = geocoder;

        const reverse = (pos: Coords) => {
          geocoder.geocode({ location: pos, language: "ar" }, (results: any, status: any) => {
            const addr = status === "OK" && results?.[0]?.formatted_address;
            onChange(pos, addr || undefined);
          });
        };

        marker.addListener("dragend", () => {
          const p = marker.getPosition();
          if (p) reverse({ lat: p.lat(), lng: p.lng() });
        });
        map.addListener("click", (e: any) => {
          if (!e.latLng) return;
          const p = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          marker.setPosition(p);
          reverse(p);
        });

        if (!value) {
          // initial fire so parent has coords
          onChange(center);
        }
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message ?? "تعذر تحميل الخريطة");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep marker in sync when parent updates value externally
  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !value) return;
    markerRef.current.setPosition(value);
    mapRef.current.panTo(value);
  }, [value?.lat, value?.lng]);

  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (mapRef.current && markerRef.current) {
          markerRef.current.setPosition(p);
          mapRef.current.panTo(p);
          mapRef.current.setZoom(16);
        }
        if (geocoderRef.current) {
          geocoderRef.current.geocode({ location: p, language: "ar" }, (results: any, status: any) => {
            const addr = status === "OK" && results?.[0]?.formatted_address;
            onChange(p, addr || undefined);
          });
        } else {
          onChange(p);
        }
      },
      undefined,
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden border border-border" style={{ height }}>
      <div ref={containerRef} className="absolute inset-0" style={{ background: "#e5edf5" }} />
      {loading && (
        <div className="absolute inset-0 grid place-items-center bg-white/60">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: accent }} />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center text-center px-4">
          <div className="text-sm text-muted-foreground flex flex-col items-center gap-2">
            <MapPin className="h-5 w-5" />
            {error}
          </div>
        </div>
      )}
      {!loading && !error && (
        <button
          type="button"
          onClick={useMyLocation}
          className="absolute bottom-3 right-3 h-10 w-10 rounded-full bg-white shadow-lg grid place-items-center btn-press"
          aria-label="موقعي"
        >
          <Crosshair className="h-5 w-5" style={{ color: accent }} />
        </button>
      )}
    </div>
  );
}

export function StaticMapPreview({
  coords,
  height = 140,
  accent = "#0ea5e9",
}: {
  coords: Coords;
  height?: number;
  accent?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((g) => {
      if (cancelled || !containerRef.current) return;
      const map = new g.maps.Map(containerRef.current, {
        center: coords,
        zoom: 15,
        disableDefaultUI: true,
        gestureHandling: "none",
        clickableIcons: false,
      });
      new g.maps.Marker({ position: coords, map });
    });
    return () => {
      cancelled = true;
    };
  }, [coords.lat, coords.lng]);

  return (
    <div
      ref={containerRef}
      className="rounded-2xl overflow-hidden border border-border"
      style={{ height, background: "#e5edf5", borderColor: accent + "33" }}
    />
  );
}
