import { useCallback, useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/google-maps";
import { getCurrentLocation, locationError } from "@/lib/location";
import { lookupMapPlace } from "@/lib/maps.functions";
import { Loader2, MapPin, Crosshair, Search, X, CheckCircle2, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
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
  autoLocateOnMount = false,
  showLocateButton = true,
  onConfirm,
  confirmLabel = "تأكيد الموقع",
  startFull = false,
  stepTitle,
  onBack,
  fallbackCenter,
  onAutoLocated,
}: {
  value: Coords | null;
  onChange: (c: Coords, address?: string) => void;
  height?: number;
  accent?: string;
  placeholder?: string;
  nearby?: ProviderPin[];
  nearbyKind?: "car" | "worker";
  autoLocateOnMount?: boolean;
  showLocateButton?: boolean;
  onConfirm?: () => void;
  confirmLabel?: string;
  /** Open the map covering the whole screen right away. */
  startFull?: boolean;
  /** Small badge shown above the map in full-screen mode. */
  stepTitle?: string;
  /** Back arrow shown in full-screen mode. */
  onBack?: () => void;
  /** Where the map opens when no location is picked yet. */
  fallbackCenter?: Coords | null;
  /** Fired once after "my location" succeeds and the address is read. */
  onAutoLocated?: (c: Coords, address?: string) => void;
}) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const fallbackCenterRef = useRef(fallbackCenter);
  fallbackCenterRef.current = fallbackCenter;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onAutoLocatedRef = useRef(onAutoLocated);
  onAutoLocatedRef.current = onAutoLocated;
  const [full, setFull] = useState(startFull);
  const [picked, setPicked] = useState(false);
  const report = useCallback((c: Coords, addr?: string) => {
    setPicked(true);
    onChangeRef.current(c, addr);
  }, []);
  const reverseFallback = useCallback((c: Coords, onDone?: (addr?: string) => void) => {
    lookupMapPlace({ data: { action: "reverse", center: c } })
      .then((result) => {
        const response = result as { address?: string };
        if (response.address) {
          setAddress(response.address);
          report(c, response.address);
          onDone?.(response.address);
        } else {
          onDone?.();
        }
      })
      .catch(() => onDone?.());
  }, [report]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressIdleRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState<string>("");
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [sharedOk, setSharedOk] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{ id: string; text: string; secondary: string }>>([]);
  const sessionTokenRef = useRef<string | null>(null);
  const acServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesSvcRef = useRef<google.maps.places.PlacesService | null>(null);
  const nearbyMarkersRef = useRef<
    Map<string, { marker: google.maps.Marker; anim: { from: Coords; to: Coords; startedAt: number; raf: number | null; heading: number } | null }>
  >(new Map());
  const readyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const slow = setTimeout(() => {
      if (!readyRef.current && !cancelled) {
        setLoading(false);
        setError("الخريطة بطيئة بالتحميل، تقدر تشارك موقعك مباشرة");
      }
    }, 12000);
    loadGoogleMaps()
      .then((g) => {
        clearTimeout(slow);
        if (cancelled || !containerRef.current) return;
        const center = valueRef.current ?? fallbackCenterRef.current ?? DEFAULT_CENTER;
        const map = new g.maps.Map(containerRef.current, {
          center,
          zoom: 14,
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: "greedy",
        });
        mapRef.current = map;
        // Don't report the default city centre as the user's location.
        if (!valueRef.current) suppressIdleRef.current = true;
        geocoderRef.current = new g.maps.Geocoder();

        const marker = new g.maps.Marker({
          position: center,
          map,
          draggable: true,
          animation: g.maps.Animation?.DROP,
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
            geocoderRef.current?.geocode({ location: c }, (results, status) => {
              if (status === "OK" && results?.[0]) {
                const addr = results[0].formatted_address;
                setAddress(addr);
                report(c, addr);
              } else {
                report(c);
                reverseFallback(c);
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
            geocoderRef.current?.geocode({ location: c }, (results, status) => {
              if (status === "OK" && results?.[0]) {
                const addr = results[0].formatted_address;
                setAddress(addr);
                report(c, addr);
              } else {
                report(c);
                reverseFallback(c);
              }
            });
          }, 500);
        });

        setLoading(false);
        readyRef.current = true;
      })
      .catch((e) => {
        clearTimeout(slow);
        console.error("map init failed", e);
        if (!cancelled) setError("تعذّر تحميل الخريطة. تحقق من اتصال الإنترنت.");
      });

    return () => {
      cancelled = true;
      clearTimeout(slow);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [reverseFallback, report]);

  useEffect(() => {
    if (!readyRef.current || !mapRef.current || !value) return;
    suppressIdleRef.current = true;
    mapRef.current.panTo(value);
  }, [value]);

  useEffect(() => {
    if (!nearby?.length || !mapRef.current) return;
    const g = (window as Window & { google?: typeof google }).google;
    if (!g?.maps) return;

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
        const icon: google.maps.Symbol = {
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
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("جهازك لا يدعم تحديد الموقع");
      return;
    }
    setLocating(true);
    setGeoError(null);
    getCurrentLocation(navigator.geolocation)
      .then((c) => {
        setSharedOk(true);
        setLocating(false);
        if (mapRef.current) {
          suppressIdleRef.current = true;
          mapRef.current.panTo(c);
          mapRef.current.setZoom(16);
        }
        report(c);
        let notified = false;
        const finish = (addr?: string) => {
          if (notified) return;
          notified = true;
          onAutoLocatedRef.current?.(c, addr);
        };
        reverseFallback(c, finish);
        try {
          geocoderRef.current?.geocode({ location: c }, (results, status) => {
            if (status === "OK" && results?.[0]) {
              const addr = results[0].formatted_address;
              setAddress(addr);
              report(c, addr);
              finish(addr);
            }
          });
        } catch {
          /* address optional */
        }
        setTimeout(() => finish(), 2500);
      })
      .catch((err) => {
        setLocating(false);
        setGeoError(locationError(err ?? {}));
      });
  }

  useEffect(() => {
    if (autoLocateOnMount && !value) autoLocate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Place search: Google Places (via our server) first, OpenStreetMap as backup.
  const placeCacheRef = useRef<Map<string, { coords: Coords; address: string }>>(new Map());
  useEffect(() => {
    if (!searchOpen || searchQuery.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    let stale = false;
    const q = searchQuery.trim();
    const timer = setTimeout(async () => {
      if (!sessionTokenRef.current) sessionTokenRef.current = crypto.randomUUID();
      const center = mapRef.current?.getCenter?.();
      const centerValue = center as unknown as { lat: number | (() => number); lng: number | (() => number) } | null;
      const c: Coords = centerValue
        ? {
            lat: typeof centerValue.lat === "function" ? centerValue.lat() : centerValue.lat,
            lng: typeof centerValue.lng === "function" ? centerValue.lng() : centerValue.lng,
          }
        : value ?? DEFAULT_CENTER;
      try {
        const result = await lookupMapPlace({ data: { action: "autocomplete", input: q, sessionToken: sessionTokenRef.current, center: c } });
        const response = result as { suggestions?: Array<{ id: string; text: string }> };
        if (stale) return;
        if (response.suggestions?.length) {
          setSuggestions(response.suggestions.map((suggestion) => ({ id: "g:" + suggestion.id, text: suggestion.text, secondary: "" })));
          return;
        }
      } catch {
        /* fall back below */
      }
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=iq&accept-language=ar&limit=6`);
        const raw: unknown = await r.json();
        if (stale) return;
        const data = Array.isArray(raw) ? raw as Array<{ place_id: number; display_name: string; lat: string; lon: string; name?: string }> : [];
        setSuggestions(
          data.map((d) => {
            const id = "o:" + d.place_id;
            const parts = String(d.display_name || "").split(",");
            placeCacheRef.current.set(id, { coords: { lat: parseFloat(d.lat), lng: parseFloat(d.lon) }, address: d.display_name });
            return { id, text: d.name || parts[0], secondary: parts.slice(1, 3).join("،").trim() };
          }),
        );
      } catch {
        if (!stale) setSuggestions([]);
      }
    }, 350);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [searchQuery, searchOpen, value]);

  async function pickSuggestion(id: string, label: string) {
    let place = placeCacheRef.current.get(id);
    if (!place && id.startsWith("g:")) {
      try {
        const result = await lookupMapPlace({ data: { action: "details", placeId: id.slice(2), sessionToken: sessionTokenRef.current ?? crypto.randomUUID() } });
        const response = result as { coords: Coords; address?: string };
        place = { coords: response.coords, address: response.address || label };
      } catch {
        setGeoError("تعذّر فتح هذا المكان، جرّب مكان ثاني");
        return;
      }
      sessionTokenRef.current = null;
    }
    if (!place) return;
    const addr = place.address || label;
    setAddress(addr);
    setSearchOpen(false);
    setSuggestions([]);
    setSearchQuery("");
    suppressIdleRef.current = true;
    if (mapRef.current) {
      mapRef.current.panTo(place.coords);
      mapRef.current.setZoom(16);
    }
    report(place.coords, addr);
  }

  const locateLabel = locating ? "جاري تحديد موقعك..." : sharedOk ? "تم تحديد موقعك ✓ (اضغط للتحديث)" : "📍 حدد موقعي الحالي تلقائياً";

  return (
    <>
    <div
      className={full ? "fixed inset-0 z-[60] overflow-hidden bg-background" : "relative rounded-3xl overflow-hidden border border-border shadow-sm"}
      style={{ height: full ? "100dvh" : height }}
    >
      <div ref={containerRef} className="absolute inset-0 z-0" style={{ background: "#e5edf5" }} />

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

      {/* Top chrome: search bar (plus back arrow + step badge in full-screen) */}
      {!loading && !error && (
        <div className={full ? "absolute top-0 inset-x-0 z-20 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]" : "absolute top-3 left-3 right-3 z-10"}>
          <div className="flex items-center gap-2">
            {full && onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="رجوع"
                className="h-11 w-11 shrink-0 rounded-2xl bg-white shadow-lg grid place-items-center btn-press"
              >
                <ChevronRight className="h-5 w-5" style={{ color: accent }} />
              </button>
            )}
            <div className="flex-1 min-w-0 flex items-center gap-2 bg-white rounded-2xl shadow-lg px-3 py-2">
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
          </div>

          {full && stepTitle && !searchOpen && (
            <div
              className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black text-white shadow-lg"
              style={{ background: accent }}
            >
              <MapPin className="h-3.5 w-3.5" /> {stepTitle}
            </div>
          )}

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

      {/* Address card (embedded mode only — full mode has its own bottom sheet) */}
      {!full && !loading && !error && address && (
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
        <div className="absolute inset-0 grid place-items-center text-center px-4 bg-white/80 z-20">
          <div className="text-sm text-muted-foreground flex flex-col items-center gap-2">
            <MapPin className="h-5 w-5" />
            {error}
            <button
              type="button"
              onClick={() => autoLocate()}
              disabled={locating}
              className="mt-2 px-5 py-3 rounded-2xl font-bold text-white shadow-lg flex items-center gap-2 disabled:opacity-70"
              style={{ background: accent }}
            >
              {locating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Crosshair className="h-5 w-5" />}
              {sharedOk ? "تمت مشاركة موقعك ✓" : "شارك موقعي الحالي"}
            </button>
          </div>
        </div>
      )}

      {geoError && (
        <div className={`absolute ${full ? "bottom-44" : "bottom-16"} left-3 right-3 z-30 bg-destructive text-destructive-foreground rounded-2xl px-3 py-2 text-xs font-bold shadow-lg flex items-start gap-2`}>
          <span className="flex-1">{geoError}</span>
          <button type="button" onClick={() => setGeoError(null)} aria-label="إغلاق"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Full-screen bottom sheet: address + locate + confirm */}
      {full && !error && (
        <div className="absolute bottom-0 inset-x-0 z-30 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-background via-background/95 to-transparent">
          {address && (
            <div className="bg-white rounded-2xl px-3 py-2.5 shadow-lg mb-2 flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0" style={{ color: accent }} />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">الموقع المحدد</div>
                <div className="text-xs font-bold truncate">{address}</div>
              </div>
            </div>
          )}
          {showLocateButton && (
            <button
              type="button"
              onClick={() => autoLocate()}
              disabled={locating}
              className="w-full h-12 mb-2 rounded-2xl font-bold text-sm shadow-lg flex items-center justify-center gap-2 btn-press disabled:opacity-80 text-primary-foreground"
              style={{ background: accent }}
            >
              {locating ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> {locateLabel}</>
              ) : sharedOk ? (
                <><CheckCircle2 className="h-5 w-5" /> {locateLabel}</>
              ) : (
                <><Crosshair className="h-5 w-5" /> {locateLabel}</>
              )}
            </button>
          )}
          {onConfirm && (
            <button
              type="button"
              disabled={!value && !picked}
              onClick={() => { setFull(false); onConfirm(); setTimeout(() => window.dispatchEvent(new Event("resize")), 60); }}
              className={`w-full h-14 rounded-2xl font-black text-base shadow-xl btn-press disabled:opacity-50 flex items-center justify-center gap-2 ${
                showLocateButton ? "bg-foreground text-background" : "text-primary-foreground"
              }`}
              style={showLocateButton ? undefined : { background: accent }}
            >
              <CheckCircle2 className="h-5 w-5" /> {confirmLabel}
            </button>
          )}
        </div>
      )}

      {/* Embedded mode floating controls */}
      {!full && !loading && !error && (
        <button
          type="button"
          onClick={() => { setFull((f) => !f); setTimeout(() => window.dispatchEvent(new Event("resize")), 60); }}
          className="absolute bottom-16 right-3 h-11 w-11 rounded-full bg-white shadow-lg grid place-items-center btn-press z-10"
          aria-label="خريطة بشاشة كاملة"
        >
          <Maximize2 className="h-5 w-5" style={{ color: accent }} />
        </button>
      )}

      {!full && !loading && !error && (
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

    {full && onBack && (
      <div className="fixed inset-x-0 bottom-0 z-[59] h-0" aria-hidden />
    )}

    {!full && onConfirm && (
      <button
        type="button"
        disabled={!value && !picked}
        onClick={onConfirm}
        className="mt-3 w-full h-14 rounded-2xl font-black text-base shadow-lg flex items-center justify-center gap-2 btn-press disabled:opacity-50 bg-foreground text-background"
      >
        <CheckCircle2 className="h-5 w-5" /> {confirmLabel}
      </button>
    )}
    {!full && showLocateButton && (
      <button
        type="button"
        onClick={() => autoLocate()}
        disabled={locating}
        className="mt-3 w-full h-14 rounded-2xl font-black text-base shadow-lg flex items-center justify-center gap-2 btn-press disabled:opacity-80 text-primary-foreground"
        style={{ background: accent }}
      >
        {locating ? (
          <><Loader2 className="h-5 w-5 animate-spin" /> {locateLabel}</>
        ) : sharedOk ? (
          <><CheckCircle2 className="h-5 w-5" /> {locateLabel}</>
        ) : (
          <><Crosshair className="h-5 w-5" /> {locateLabel}</>
        )}
      </button>
    )}
    </>
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
  const { lat, lng } = coords;

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((g) => {
      if (cancelled || !containerRef.current) return;
      const map = new g.maps.Map(containerRef.current, {
        center: { lat, lng },
        zoom: 15,
        disableDefaultUI: true,
        gestureHandling: "none",
        clickableIcons: false,
      });
      new g.maps.Marker({ position: { lat, lng }, map });
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      className="rounded-2xl overflow-hidden border border-border"
      style={{ height, background: "#e5edf5", borderColor: accent + "33" }}
    />
  );
}
