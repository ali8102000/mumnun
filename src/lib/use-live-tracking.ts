import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Coords = { lat: number; lng: number; heading?: number | null };

/**
 * Publishes current user's location to live_locations and subscribes to the
 * other party's location for a given request.
 */
export function useLiveTracking(opts: {
  requestId: string | null;
  myUserId: string | null;
  otherUserId: string | null;
  myRole: "customer" | "provider";
  active: boolean; // only track while request is accepted / in_progress
}) {
  const { requestId, myUserId, otherUserId, myRole, active } = opts;
  const [me, setMe] = useState<Coords | null>(null);
  const [other, setOther] = useState<Coords | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastPushRef = useRef<number>(0);

  // Publish my location
  useEffect(() => {
    if (!active || !requestId || !myUserId || typeof navigator === "undefined") return;
    if (!navigator.geolocation) return;

    const push = async (lat: number, lng: number, heading: number | null) => {
      const now = Date.now();
      if (now - lastPushRef.current < 3000) return; // throttle ~3s
      lastPushRef.current = now;
      await supabase.from("live_locations").upsert(
        { request_id: requestId, user_id: myUserId, role: myRole, lat, lng, heading, updated_at: new Date().toISOString() },
        { onConflict: "request_id,user_id" }
      );
    };

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude, heading: pos.coords.heading };
        setMe(c);
        push(c.lat, c.lng, c.heading ?? null);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
    watchIdRef.current = id;
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    };
  }, [active, requestId, myUserId, myRole]);

  // Load + subscribe to other's location
  useEffect(() => {
    if (!requestId || !otherUserId) return;
    let cancelled = false;

    supabase
      .from("live_locations")
      .select("lat,lng,heading")
      .eq("request_id", requestId)
      .eq("user_id", otherUserId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setOther({ lat: Number(data.lat), lng: Number(data.lng), heading: data.heading });
      });

    const ch = supabase
      .channel(`live-${requestId}-${otherUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_locations", filter: `request_id=eq.${requestId}` },
        (payload) => {
          const row: any = payload.new;
          if (!row || row.user_id !== otherUserId) return;
          setOther({ lat: Number(row.lat), lng: Number(row.lng), heading: row.heading });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [requestId, otherUserId]);

  return { me, other };
}
