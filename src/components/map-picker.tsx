import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/google-maps";
import { Loader2, MapPin, Crosshair, Search, X } from "lucide-react";

type Coords = { lat: number; lng: number };

const DEFAULT_CENTER: Coords = { lat: 33.3152, lng: 44.3661 }; // Baghdad

/**
 * Baly-style map picker:
 *  - Auto-detects current location on mount and drops the pin there.
 *  - Center-of-map pin (not a draggable marker) — user pans the map to pick.
 *  - Places autocomplete search bar (Iraq-biased, Arabic).
 *  - Recenter-to-me FAB.
 */
export function MapPicker({
  value,
  onChange,
  height = 280,
  accent = "#0ea5e9",
  placeholder = "ابحث عن مكان...",
}: {
  value: Coords | null;
  onChange: (c: Coords, address?: string) => void;
  height?: number;
  accent?: string;
  placeholder?: string;
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
  const [suggestions, setSuggestions] = useState<Array<{ id: string; text: string; secondary: string }>>([]);
  const sessionTokenRef = useRef<any>(null);
  const acServiceRef = useRef<any>(null);
  const placesSvcRef = useRef<any>(null);

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
          styles: [
            { featureType: "poi.business", stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] },
          ],
        });
        mapRef.current = map;
        geocoderRef.current = new g.maps.Geocoder();
        try {
          acServiceRef.current = new g.maps.places.AutocompleteService();
          sessionTokenRef.current = new g.maps.places.AutocompleteSessionToken();
          placesSvcRef.current = new g.maps.places.PlacesService(map);
        } catch {}

        // Debounced idle → propagate center as new pin
        map.addListener("idle", () => {
          if (suppressIdleRef.current) {
            suppressIdleRef.current = false;
            return;
          }
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
          idleTimerRef.current = setTimeout(() => {
            const c = map.getCenter();
            if (!c) return;
            const pos = { lat: c.lat(), lng: c.lng() };
            reverseGeocode(pos);
          }, 250);
        });

        setLoading(false);

        // Auto-locate if we have no initial value
        if (!value) {
          autoLocate(map);
        } else {
          reverseGeocode(center);
        }
      })
      .catch((e) => {
        setError(e.message ?? "تعذر تحميل الخريطة");
        setLoading(false);
      });
    return () => {
      cancelled = true;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reverseGeocode(pos: Coords) {
    if (!geocoderRef.current) {
      onChange(pos);
      return;
    }
    geocoderRef.current.geocode({ location: pos, language: "ar" }, (results: any, status: any) => {
      const addr = status === "OK" && results?.[0]?.formatted_address;
      setAddress(addr || "");
      onChange(pos, addr || undefined);
    });
  }

  function autoLocate(map?: any) {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const m = map ?? mapRef.current;
        if (m) {
          m.panTo(p);
          m.setZoom(16);
        }
        reverseGeocode(p);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  // Keep map in sync when parent updates value externally
  useEffect(() => {
    if (!mapRef.current || !value) return;
    const c = mapRef.current.getCenter();
    if (!c) return;
    if (Math.abs(c.lat() - value.lat) < 1e-6 && Math.abs(c.lng() - value.lng) < 1e-6) return;
    suppressIdleRef.current = true;
    mapRef.current.panTo(value);
  }, [value?.lat, value?.lng]);

  function handleSearchInput(q: string) {
    if (!acServiceRef.current || !q.trim()) {
      setSuggestions([]);
      return;
    }
    acServiceRef.current.getPlacePredictions(
      {
        input: q,
        language: "ar",
        componentRestrictions: { country: "iq" },
        sessionToken: sessionTokenRef.current,
      },
      (preds: any[], status: any) => {
        if (status !== "OK" || !preds) {
          setSuggestions([]);
          return;
        }
        setSuggestions(
          preds.slice(0, 6).map((p) => ({
            id: p.place_id,
            text: p.structured_formatting?.main_text ?? p.description,
            secondary: p.structured_formatting?.secondary_text ?? "",
          }))
        );
      }
    );
  }

  function pickSuggestion(id: string, label: string) {
    if (!placesSvcRef.current) return;
    placesSvcRef.current.getDetails(
      { placeId: id, fields: ["geometry", "formatted_address", "name"] },
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
        if (inputRef.current) inputRef.current.value = "";
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

      {/* Search bar */}
      {!loading && !error && (
        <div className="absolute top-3 left-3 right-3 z-10">
          <div className="flex items-center gap-2 bg-white rounded-2xl shadow-lg px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              onFocus={() => setSearchOpen(true)}
              onChange={(e) => handleSearchInput(e.target.value)}
              placeholder={placeholder}
              className="flex-1 bg-transparent outline-none text-sm font-medium min-w-0"
            />
            {searchOpen && (
              <button
                type="button"
                onClick={() => {
                  setSearchOpen(false);
                  setSuggestions([]);
                  if (inputRef.current) inputRef.current.value = "";
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

      {/* Center pin */}
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

      {/* Address readout */}
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

      {/* Recenter FAB */}
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
