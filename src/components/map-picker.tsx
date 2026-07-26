import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/google-maps";
import { Loader2, MapPin, Crosshair, Search, X } from "lucide-react";
import type { ProviderPin } from "@/lib/use-nearby-providers";

type Coords = { lat: number; lng: number };

const DEFAULT_CENTER: Coords = { lat: 33.3152, lng: 44.3661 };

export function MapPicker({
  value,
  onChange,
  height = 280,
  accent = "#0ea5e9",
  placeholder = "ابحث عن مكان...",
  nearby,
  nearbyKind = "car",
}: {
  value: Coords | null;
  onChange: (c: Coords, address?: string) => void;
  height?: number;
  accent?: string;
  placeholder?: string;
  nearby?: ProviderPin[];
  nearbyKind?: "car" | "worker";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);
  const idleTimerRef = useRef<any>(null);
  const suppressIdleRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState<string>("");
  const [locating, setLocating] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{ id: string; text: string; secondary: string }>>([]);
  const sessionTokenRef = useRef<any>(null);
  const acServiceRef = useRef<any>(null);
  const placesSvcRef = useRef<any>(null);
  const nearbyMarkersRef = useRef<
    Map<string, { marker: any; anim: { from: Coords; to: Coords; startedAt: number; raf: number | null; heading: number } | null }>
  >(new Map());
  const readyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !containerRef.current) return;
        const center = value ?? DEFAULT_CENTER;
        const map = new g.maps.Map(containerRef.current, {
          center,
          zoom: 14,
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: "greedy",
        });
        mapRef.current = map;
        geocoderRef.current = new g.maps.Geocoder();

        const marker = new g.maps.Marker({
          position: center,
          map,
          draggable: true,
          animation: g.maps.Animation.DROP,
        });

        marker.addListener("dragend", () => {
          const pos = marker.getPosition();
          if (!pos) return;
          const c = { lat: pos.lat(), lng: pos.lng() };
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
          idleTimerRef.current = setTimeout(() => {
            if (suppressIdleRef.current) {
              suppressIdleRef.current = false;
              return;
            }
            geocoderRef.current?.geocode({ location: c }, (results: any, status: any) => {
              if (status === "OK" && results?.[0]) {
                const addr = results[0].formatted_address;
                setAddress(addr);
                onChange(c, addr);
              } else {
                onChange(c);
              }
            });
          }, 300);
        });

        map.addListener("idle", () => {
          if (suppressIdleRef.current) {
            suppressIdleRef.current = false;
            return;
          }
          const center = map.getCenter();
          if (!center) return;
          const c = { lat: center.lat(), lng: center.lng() };
          marker.setPosition(center);
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
          idleTimerRef.current = setTimeout(() => {
            geocoderRef.current?.geocode({ location: c }, (results: any, status: any) => {
              if (status === "OK" && results?.[0]) {
                const addr = results[0].formatted_address;
                setAddress(addr);
                onChange(c, addr);
              } else {
                onChange(c);
              }
            });
          }, 500);
        });

        setLoading(false);
        readyRef.current = true;
      })
      .catch(() => {
        if (!cancelled) setError("تعذّر تحميل الخريطة. تحقق من اتصال الإنترنت.");
      });

    return () => {
      cancelled = true;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!readyRef.current || !mapRef.current || !value) return;
    suppressIdleRef.current = true;
    mapRef.current.panTo(value);
  }, [value]);

  useEffect(() => {
    if (!nearby?.length || !mapRef.current) return;
    const g = (window as any).google;
    if (!g) return;

    nearby.forEach((pin) => {
      const existing = nearbyMarkersRef.current.get(pin.pin_id);
      if (existing) {
        if (existing.anim) {
          cancelAnimationFrame(existing.anim.raf ?? 0);
        }
        const from = existing.marker.getPosition?.();
        const fromCoords: Coords = from ? { lat: from.lat(), lng: from.lng() } : { lat: pin.lat, lng: pin.lng };
        existing.anim = {
          from: fromCoords,
          to: { lat: pin.lat, lng: pin.lng },
          startedAt: Date.now(),
          raf: null,
          heading: pin.heading ?? 0,
        };
        const animate = () => {
          if (!existing.anim) return;
          const elapsed = Date.now() - existing.anim.startedAt;
          const t = Math.min(1, elapsed / 1000);
          const easeT = 1 - Math.pow(1 - t, 3);
          const lat = existing.anim.from.lat + (existing.anim.to.lat - existing.anim.from.lat) * easeT;
          const lng = existing.anim.from.lng + (existing.anim.to.lng - existing.anim.from.lng) * easeT;
          existing.marker.setPosition({ lat, lng });
          if (t < 1) {
            existing.anim.raf = requestAnimationFrame(animate);
          } else {
            existing.anim = null;
          }
        };
        existing.anim.raf = requestAnimationFrame(animate);
      } else {
        const icon: any = {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: nearbyKind === "worker" ? "#10b981" : "#3b82f6",
          fillOpacity: 0.8,
          strokeColor: "#fff",
          strokeWeight: 2,
        };
        const m = new g.maps.Marker({
          position: { lat: pin.lat, lng: pin.lng },
          map: mapRef.current,
          icon,
        });
        nearbyMarkersRef.current.set(pin.pin_id, { marker: m, anim: null });
      }
    });

    const currentIds = new Set(nearby.map((p) => p.pin_id));
    nearbyMarkersRef.current.forEach((entry, id) => {
      if (!currentIds.has(id)) {
        entry.marker.setMap(null);
        if (entry.anim) cancelAnimationFrame(entry.anim.raf ?? 0);
        nearbyMarkersRef.current.delete(id);
      }
    });
  }, [nearby, nearbyKind]);

  function autoLocate() {
    if (!navigator.geolocation || !mapRef.current) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        suppressIdleRef.current = true;
        mapRef.current.panTo(c);
        mapRef.current.setZoom(16);
        geocoderRef.current?.geocode({ location: c }, (results: any, status: any) => {
          if (status === "OK" && results?.[0]) {
            const addr = results[0].formatted_address;
            setAddress(addr);
            onChange(c, addr);
          } else {
            onChange(c);
          }
          setLocating(false);
        });
      },
      () => {
        setLocating(false);
        setError("تعذّر تحديد موقعك");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  useEffect(() => {
    if (!searchOpen || !searchQuery.trim()) {
      setSuggestions([]);
      return;
    }
    const g = (window as any).google;
    if (!g) return;
    if (!acServiceRef.current) {
      acServiceRef.current = new g.maps.places.AutocompleteService();
      sessionTokenRef.current = new g.maps.places.AutocompleteSessionToken();
    }
    const timer = setTimeout(() => {
      acServiceRef.current.getPlacePredictions(
        {
          input: searchQuery,
          sessionToken: sessionTokenRef.current,
          componentRestrictions: { country: "iq" },
        },
        (predictions: any, status: any) => {
          if (status !== "OK" || !predictions) {
            setSuggestions([]);
            return;
          }
          setSuggestions(
            predictions.map((p: any) => ({
              id: p.place_id,
              text: p.structured_formatting?.main_text || p.description,
              secondary: p.structured_formatting?.secondary_text || "",
            })),
          );
        },
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchOpen]);

  function pickSuggestion(placeId: string, label: string) {
    const g = (window as any).google;
    if (!g || !placesSvcRef.current) {
      placesSvcRef.current = new g.maps.places.PlacesService(mapRef.current);
    }
    placesSvcRef.current.getDetails(
      { placeId, fields: ["geometry", "formatted_address", "name"] },
      (place: any, status: any) => {
        if (status !== "OK" || !place?.geometry?.location) return;
        const p = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        };
        const addr = place.formatted_address || place.name || label;
        setAddress(addr);
        setSearchOpen(false);
        setSuggestions([]);
        setSearchQuery("");
        suppressIdleRef.current = true;
        if (mapRef.current) {
          mapRef.current.panTo(p);
          mapRef.current.setZoom(16);
        }
        onChange(p, addr);
      }
    );
  }

  return (
    <div className="relative rounded-3xl overflow-hidden border border-border shadow-sm" style={{ height }}>
      <div ref={containerRef} className="absolute inset-0" style={{ background: "#e5edf5" }} />

      {!loading && !error && (
        <div className="absolute top-3 left-3 right-3 z-10">
          <div className="flex items-center gap-2 bg-white rounded-2xl shadow-lg px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              onFocus={() => setSearchOpen(true)}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={placeholder}
              className="flex-1 bg-transparent outline-none text-sm font-medium min-w-0"
            />
            {searchOpen && (
              <button
                type="button"
                onClick={() => {
                  setSearchOpen(false);
                  setSuggestions([]);
                  setSearchQuery("");
                }}
                className="text-muted-foreground"
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {searchOpen && suggestions.length > 0 && (
            <div className="mt-2 bg-white rounded-2xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pickSuggestion(s.id, s.text)}
                  className="w-full text-right px-3 py-2.5 border-b last:border-b-0 border-border/40 active:bg-muted flex items-start gap-2"
                >
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0" style={{ color: accent }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold truncate">{s.text}</div>
                    {s.secondary && (
                      <div className="text-[11px] text-muted-foreground truncate">{s.secondary}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && !error && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center z-[5]">
          <div className="flex flex-col items-center -translate-y-3">
            <div
              className="h-9 w-9 rounded-full grid place-items-center shadow-lg animate-in zoom-in-50 duration-200"
              style={{ background: accent }}
            >
              <MapPin className="h-5 w-5 text-white" fill="white" />
            </div>
            <div className="h-2 w-2 rounded-full bg-black/40 -mt-0.5 shadow" />
          </div>
        </div>
      )}

      {!loading && !error && address && (
        <div className="absolute bottom-3 left-3 right-16 bg-white/95 backdrop-blur rounded-2xl px-3 py-2 shadow-lg z-10">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">الموقع المحدد</div>
          <div className="text-xs font-bold truncate">{address}</div>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 grid place-items-center bg-white/60 z-20">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: accent }} />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center text-center px-4 bg-white/80">
          <div className="text-sm text-muted-foreground flex flex-col items-center gap-2">
            <MapPin className="h-5 w-5" />
            {error}
          </div>
        </div>
      )}

      {!loading && !error && (
        <button
          type="button"
          onClick={() => autoLocate()}
          disabled={locating}
          className="absolute bottom-3 right-3 h-11 w-11 rounded-full bg-white shadow-lg grid place-items-center btn-press disabled:opacity-70 z-10"
          aria-label="موقعي"
        >
          {locating ? (
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: accent }} />
          ) : (
            <Crosshair className="h-5 w-5" style={{ color: accent }} />
          )}
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
