// Lightweight Google Maps JS API loader (singleton)
// Falls back to Leaflet/OpenStreetMap if no API key is available.

let loaderPromise: Promise<any> | null = null;
let provider: "google" | "leaflet" | null = null;

const FALLBACK_KEY = "AIzaSyBPxHJt9E92tCiIlVQa36Nrq6HBeY8ss7M";

export function getMapProvider(): "google" | "leaflet" | null {
  return provider;
}

export function loadGoogleMaps(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if ((window as any).google?.maps) {
    provider = "google";
    return Promise.resolve((window as any).google);
  }
  if (loaderPromise) return loaderPromise;

  const key =
    (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ||
    (import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined) ||
    FALLBACK_KEY;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;

  if (!key) {
    loaderPromise = loadLeafletFallback();
    return loaderPromise;
  }

  loaderPromise = new Promise((resolve, reject) => {
    const cbName = `__gmInit_${Date.now()}`;
    (window as any)[cbName] = () => {
      provider = "google";
      resolve((window as any).google);
      delete (window as any)[cbName];
    };
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places,geometry&loading=async&callback=${cbName}&language=ar&region=IQ${channel ? `&channel=${channel}` : ""}`;
    s.async = true;
    s.defer = true;
    s.onerror = () => {
      loaderPromise = null;
      loadLeafletFallback().then(resolve).catch(reject);
    };
    document.head.appendChild(s);
  });

  return loaderPromise;
}

async function loadLeafletFallback(): Promise<any> {
  if (!document.querySelector('link[href*="leaflet"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
  }

  if (!(window as any).L) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Leaflet failed to load"));
      document.head.appendChild(s);
    });
  }

  provider = "leaflet";
  return (window as any).L;
}

// Geocoding: convert coordinates to address and vice versa
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key =
    (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ||
    FALLBACK_KEY;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=ar&region=IQ&key=${key}`
    );
    const data = await res.json();
    if (data.results?.length > 0) return data.results[0].formatted_address;
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const key =
    (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ||
    FALLBACK_KEY;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&language=ar&region=IQ&key=${key}`
    );
    const data = await res.json();
    if (data.results?.length > 0) {
      const loc = data.results[0].geometry.location;
      return { lat: loc.lat, lng: loc.lng };
    }
    return null;
  } catch {
    return null;
  }
}

// Haversine distance in km
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
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

// Estimate ETA in minutes (assumes ~40 km/h average city speed)
export function estimateEtaMinutes(distanceKm: number): number {
  return Math.max(1, Math.round((distanceKm / 40) * 60));
}
