import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ProviderPin = {
  pin_id: string;
  lat: number;
  lng: number;
  heading: number | null;
};

export function useNearbyProviders(opts: {
  center: { lat: number; lng: number } | null;
  type: "taxi" | "service";
  category?: string | null;
  serviceId?: string | null;
  radiusKm?: number;
  active?: boolean;
  refreshMs?: number;
}) {
  const {
    center,
    type,
    category = null,
    serviceId = null,
    radiusKm = 5,
    active = true,
    refreshMs = 8000,
  } = opts;

  const [pins, setPins] = useState<ProviderPin[]>([]);
  const timerRef = useRef<any>(null);
  const debounceRef = useRef<any>(null);
  const inflightRef = useRef(false);

  useEffect(() => {
    if (!active || !center) {
      setPins([]);
      return;
    }

    let cancelled = false;

    const fetchPins = async () => {
      if (inflightRef.current) return;
      inflightRef.current = true;
      try {
        const { data, error } = await supabase.rpc("find_nearby_provider_pins", {
          _lat: center.lat,
          _lng: center.lng,
          _type: type,
          _category: category,
          _service_id: serviceId,
          _radius_km: radiusKm,
          _limit: 30,
        } as any);
        if (cancelled) return;
        if (error) {
          return;
        }
        const rows = (data ?? []) as any[];
        setPins(
          rows.map((r) => ({
            pin_id: String(r.pin_id),
            lat: Number(r.lat),
            lng: Number(r.lng),
            heading: r.heading == null ? null : Number(r.heading),
          }))
        );
      } finally {
        inflightRef.current = false;
      }
    };

    fetchPins();
    timerRef.current = setInterval(fetchPins, refreshMs);

    const chName = `nearby-pins-${type}-${Math.random().toString(36).slice(2, 8)}`;
    const ch = supabase
      .channel(chName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_locations" },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(fetchPins, 800);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(ch);
    };
  }, [active, center?.lat, center?.lng, type, category, serviceId, radiusKm, refreshMs]);

  return pins;
}
