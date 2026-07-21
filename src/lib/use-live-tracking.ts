import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Coords = { lat: number; lng: number; heading?: number | null };

/**
 * Live location tracking hook: pushes my location to the server and
 * subscribes to the other party's location via realtime.
 */
export function useLiveTracking(opts: {
  requestId: string | null;
  myUserId: string | null;
  otherUserId: string | null;
  myRole: "customer" | "provider";
  active: boolean;
}) {
  const { requestId, myUserId, otherUserId, myRole, active } = opts;
  const [me, setMe] = useState<Coords | null>(null);
  const [other, setOther] = useState<Coords | null>(null);
  const watchRef = useRef<number | null>(null);

  // Push my location to the server
  const push = (lat: number, lng: number, heading: number | null) => {
    if (!requestId || !myUserId) return;
    supabase
      .from("live_locations")
      .upsert(
        {
          request_id: requestId,
          user_id: myUserId,
          role: myRole,
          lat,
          lng,
          heading,
          updated_at: new Date().toISOString(),
        } as any,
        { onConflict: "request_id,user_id" } as any
      )
      .then(({ error }: any) => {
        if (error) console.warn("[live-tracking] upsert error:", error.message);
      });
  };

  // Watch my GPS and push
  useEffect(() => {
    if (!active || !navigator.geolocation) return;
    navigator.geolocation.watchPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude, heading: pos.coords.heading };
        setMe(c);
        push(c.lat, c.lng, c.heading ?? null);
      },
      (err) => { console.warn("[live-tracking] geolocation error:", err.message); },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
    return () => {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, [active, requestId, myUserId, myRole]);

  // Subscribe to other party's location
  useEffect(() => {
    if (!active || !requestId || !otherUserId) return;
    const ch = supabase
      .channel(`live-${requestId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_locations", filter: `request_id=eq.${requestId}` },
        (payload: any) => {
          const row = payload.new;
          if (row.user_id === otherUserId) {
            setOther({ lat: row.lat, lng: row.lng, heading: row.heading });
          }
        }
      )
      .subscribe();

    // Also fetch initial
    supabase
      .from("live_locations")
      .select("*")
      .eq("request_id", requestId)
      .eq("user_id", otherUserId)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) setOther({ lat: data.lat, lng: data.lng, heading: data.heading });
      });

    return () => {
      supabase.removeChannel(ch);
    };
  }, [active, requestId, otherUserId]);

  return { me, other };
}
