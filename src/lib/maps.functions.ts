import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getTrustedDrivingRoute } from "@/lib/maps.server";

// Only the referrer-restricted rendering key is intentionally public.
export const getMapConfig = createServerFn({ method: "GET" }).handler(async () => ({
  browserKey: process.env['GOOGLE_MAPS_BROWSER_KEY'] || process.env['VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY'] || "",
  channel: process.env['VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID'] || "mumnun",
}));

type GoogleMapsResponse = {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: unknown;
      text?: { text?: unknown };
    };
  }>;
  location?: { latitude?: unknown; longitude?: unknown };
  formattedAddress?: unknown;
  displayName?: { text?: unknown };
  status?: string;
  error_message?: string;
  results?: Array<{ formatted_address?: unknown }>;
};

const coords = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("autocomplete"), input: z.string().trim().min(2).max(200), sessionToken: z.string().uuid(), center: coords }),
  z.object({ action: z.literal("details"), placeId: z.string().regex(/^[A-Za-z0-9_-]+$/).max(300), sessionToken: z.string().uuid() }),
  z.object({ action: z.literal("reverse"), center: coords }),
  z.object({ action: z.literal("route"), from: coords, to: coords }),
]);

export const lookupMapPlace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof input>) => input.parse(data))
  .handler(async ({ data }) => {
    if (data.action === "route") return getTrustedDrivingRoute(data.from, data.to);
    const apiKey = process.env['GOOGLE_MAPS_API_KEY'];
    const lovableKey = process.env['LOVABLE_API_KEY'];
    if (!apiKey || !lovableKey) throw new Error("إعدادات البحث عن الأماكن غير متاحة؛ يمكنك مشاركة موقعك مباشرة.");
    const gateway = "https://connector-gateway.lovable.dev/google_maps";
    const headers: Record<string, string> = { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": apiKey, "Content-Type": "application/json" };
    let path: string;
    let body: string | undefined;
    if (data.action === "autocomplete") {
      path = "/places/v1/places:autocomplete";
      headers["X-Goog-FieldMask"] = "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text";
      body = JSON.stringify({ input: data.input, sessionToken: data.sessionToken, languageCode: "ar", includedRegionCodes: ["iq"], locationBias: { circle: { center: { latitude: data.center.lat, longitude: data.center.lng }, radius: 50000 } } });
    } else if (data.action === "details") {
      path = `/places/v1/places/${encodeURIComponent(data.placeId)}?sessionToken=${data.sessionToken}&languageCode=ar`;
      headers["X-Goog-FieldMask"] = "location,formattedAddress,displayName";
    } else {
      path = `/maps/api/geocode/json?latlng=${data.center.lat},${data.center.lng}&language=ar`;
    }
    const response = await fetch(gateway + path, { method: body ? "POST" : "GET", headers, body });
    if (!response.ok) {
      const text = await response.text();
      console.error(`[Maps ${response.status}] ${text}`);
      if (response.status === 403) {
        if (text.includes("API_KEY_HTTP_REFERRER_BLOCKED")) throw new Error("مفتاح Google الخاص بخدمات البحث مقيّد بالمواقع؛ غيّر تقييده إلى None أو IP addresses في Google Cloud.");
        if (text.includes("API_KEY_SERVICE_BLOCKED")) throw new Error("فعّل Places API (New) وGeocoding API ضمن خدمات المفتاح في Google Cloud.");
      }
      throw new Error(`Google Maps [${response.status}]: ${text}`);
    }
    const result = await response.json() as GoogleMapsResponse;
    if (data.action === "autocomplete") {
      const suggestions = (result.suggestions ?? []).slice(0, 5).flatMap((suggestion) => {
        const prediction = suggestion.placePrediction;
        const id = prediction?.placeId;
        const text = prediction?.text?.text;
        return typeof id === "string" && typeof text === "string" ? [{ id, text }] : [];
      });
      return { suggestions };
    }
    if (data.action === "details") {
      const latitude = result.location?.latitude;
      const longitude = result.location?.longitude;
      if (typeof latitude !== "number" || !Number.isFinite(latitude)
        || typeof longitude !== "number" || !Number.isFinite(longitude)) {
        throw new Error("لا يتوفر موقع صالح لهذا المكان");
      }
      const address = typeof result.formattedAddress === "string"
        ? result.formattedAddress
        : typeof result.displayName?.text === "string" ? result.displayName.text : "";
      return { coords: { lat: latitude, lng: longitude }, address };
    }
    if (result.status !== "OK" && result.status !== "ZERO_RESULTS") {
      throw new Error(`Google Maps: ${result.status}: ${result.error_message || ""}`);
    }
    const formattedAddress = result.results?.[0]?.formatted_address;
    return { address: typeof formattedAddress === "string" ? formattedAddress : "" };
  });