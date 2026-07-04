import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Dispatch a request: find nearby drivers in expanding radius (2→5→10 km)
 * and create pending offers for them. Returns count of offers created.
 */
export const dispatchRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify caller owns request
    const { data: req, error } = await supabase
      .from("service_requests")
      .select("id, customer_id, type, vehicle_category, pickup_lat, pickup_lng, status")
      .eq("id", data.requestId)
      .single();
    if (error || !req) throw new Error("Request not found");
    if (req.customer_id !== userId) throw new Error("Forbidden");
    if (req.type !== "taxi") return { offers: 0, reason: "not_taxi" };
    if (!req.pickup_lat || !req.pickup_lng) throw new Error("Missing pickup location");

    // Mark as searching
    await supabaseAdmin
      .from("service_requests")
      .update({ status: "searching" as any, searching_started_at: new Date().toISOString() })
      .eq("id", req.id);

    const radii = [2, 5, 10];
    let drivers: any[] = [];
    for (const r of radii) {
      const { data: found } = await (supabaseAdmin as any).rpc("find_nearby_drivers", {
        _lat: req.pickup_lat,
        _lng: req.pickup_lng,
        _category: req.vehicle_category ?? "economy",
        _radius_km: r,
        _limit: 10,
      });
      if (found && found.length) {
        drivers = found;
        break;
      }
    }

    if (!drivers.length) return { offers: 0, reason: "no_drivers" };

    const rows = drivers.map((d: any) => ({
      request_id: req.id,
      provider_id: d.user_id,
      distance_km: d.distance_km,
      expires_at: new Date(Date.now() + 45_000).toISOString(),
    }));

    const { error: insErr } = await supabaseAdmin.from("request_offers" as any).upsert(rows, {
      onConflict: "request_id,provider_id",
    });
    if (insErr) throw new Error(insErr.message);

    // Notify drivers
    const notifs = drivers.map((d: any) => ({
      user_id: d.user_id,
      type: "new_offer",
      title: "طلب جديد قريب منك",
      body: `على بُعد ${Number(d.distance_km).toFixed(1)} كم`,
      link: `/`,
      data: { request_id: req.id },
    }));
    await supabaseAdmin.from("notifications" as any).insert(notifs);

    return { offers: drivers.length };
  });

/**
 * Driver accepts/rejects an offer. Acceptance is atomic: first accepter wins.
 */
export const respondToOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        offerId: z.string().uuid(),
        action: z.enum(["accept", "reject"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: offer, error } = await (supabaseAdmin as any)
      .from("request_offers")
      .select("*")
      .eq("id", data.offerId)
      .single();
    if (error || !offer) throw new Error("Offer not found");
    if (offer.provider_id !== userId) throw new Error("Forbidden");
    if (offer.status !== "pending") throw new Error("Offer no longer pending");
    if (new Date(offer.expires_at) < new Date()) throw new Error("Offer expired");

    if (data.action === "reject") {
      await (supabaseAdmin as any)
        .from("request_offers")
        .update({ status: "rejected", responded_at: new Date().toISOString() })
        .eq("id", offer.id);
      return { ok: true, accepted: false };
    }

    // Accept: try to assign request atomically (only succeed if still searching/pending)
    const { data: updated, error: updErr } = await supabaseAdmin
      .from("service_requests")
      .update({
        provider_id: userId,
        status: "accepted" as any,
        accepted_at: new Date().toISOString(),
      })
      .eq("id", offer.request_id)
      .in("status", ["pending", "searching"] as any)
      .select("id, customer_id")
      .maybeSingle();

    if (updErr) throw new Error(updErr.message);
    if (!updated) throw new Error("الطلب لم يعد متاحاً");

    // Mark this offer accepted, cancel siblings
    await (supabaseAdmin as any)
      .from("request_offers")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("id", offer.id);
    await (supabaseAdmin as any)
      .from("request_offers")
      .update({ status: "cancelled" })
      .eq("request_id", offer.request_id)
      .eq("status", "pending")
      .neq("id", offer.id);

    // Create chat
    await supabaseAdmin
      .from("chats")
      .insert({ request_id: offer.request_id, customer_id: updated.customer_id, provider_id: userId } as any)
      .select();

    // Notify customer
    await (supabaseAdmin as any).from("notifications").insert({
      user_id: updated.customer_id,
      type: "offer_accepted",
      title: "تم قبول طلبك",
      body: "الكابتن في طريقه إليك",
      link: `/request/${offer.request_id}`,
    });

    return { ok: true, accepted: true, requestId: offer.request_id };
  });

/**
 * Cancel a request (customer-side).
 */
export const cancelRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ requestId: z.string().uuid(), reason: z.string().max(200).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: req } = await supabase
      .from("service_requests")
      .select("id, customer_id, provider_id, status")
      .eq("id", data.requestId)
      .single();
    if (!req || req.customer_id !== userId) throw new Error("Forbidden");
    if (!["pending", "searching", "accepted"].includes(req.status as string))
      throw new Error("لا يمكن الإلغاء");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("service_requests")
      .update({
        status: "cancelled" as any,
        cancellation_reason: data.reason ?? null,
        cancelled_by: userId,
      })
      .eq("id", req.id);
    await (supabaseAdmin as any)
      .from("request_offers")
      .update({ status: "cancelled" })
      .eq("request_id", req.id)
      .eq("status", "pending");
    if (req.provider_id) {
      await (supabaseAdmin as any).from("notifications").insert({
        user_id: req.provider_id,
        type: "request_cancelled",
        title: "تم إلغاء الطلب",
        body: "قام الزبون بإلغاء الرحلة",
      });
    }
    return { ok: true };
  });

/**
 * Provider cancels an accepted/in-progress request with a reason.
 */
export const providerCancelRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ requestId: z.string().uuid(), reason: z.string().max(300).min(2) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: req } = await supabase
      .from("service_requests")
      .select("id, customer_id, provider_id, status")
      .eq("id", data.requestId)
      .single();
    if (!req || req.provider_id !== userId) throw new Error("Forbidden");
    if (!["accepted", "in_progress"].includes(req.status as string))
      throw new Error("لا يمكن الإلغاء الآن");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("service_requests")
      .update({
        status: "cancelled" as any,
        cancellation_reason: data.reason,
        cancelled_by: userId,
      })
      .eq("id", req.id);
    await (supabaseAdmin as any).from("notifications").insert({
      user_id: req.customer_id,
      type: "request_cancelled",
      title: "تم إلغاء الطلب من قِبل المزود",
      body: data.reason,
      link: `/request/${req.id}`,
    });
    return { ok: true };
  });

/**
 * Re-dispatch a request that is still searching but has no active offers
 * (all previous ones expired or were rejected). Safe to call repeatedly
 * from the customer's waiting screen every ~15s.
 */
export const retryDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: req } = await supabase
      .from("service_requests")
      .select("id, customer_id, status, vehicle_category, pickup_lat, pickup_lng")
      .eq("id", data.requestId)
      .single();
    if (!req || req.customer_id !== userId) throw new Error("Forbidden");
    if (!["pending", "searching"].includes(req.status as string))
      return { ok: false, reason: "not_searching" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Expire stale offers first
    await (supabaseAdmin as any)
      .from("request_offers")
      .update({ status: "expired" })
      .eq("request_id", req.id)
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString());

    // Any offer still pending? then nothing to do
    const { data: active } = await (supabaseAdmin as any)
      .from("request_offers")
      .select("id")
      .eq("request_id", req.id)
      .eq("status", "pending")
      .limit(1);
    if (active && active.length) return { ok: true, offers: 0, reason: "still_pending" };

    // Collect drivers we already offered to (avoid re-offering the same ones immediately)
    const { data: prior } = await (supabaseAdmin as any)
      .from("request_offers")
      .select("provider_id")
      .eq("request_id", req.id);
    const skipIds: string[] = (prior ?? []).map((p: any) => p.provider_id);

    const radii = [3, 6, 12];
    let drivers: any[] = [];
    for (const r of radii) {
      const { data: found } = await (supabaseAdmin as any).rpc("find_nearby_drivers", {
        _lat: req.pickup_lat,
        _lng: req.pickup_lng,
        _category: req.vehicle_category ?? "economy",
        _radius_km: r,
        _limit: 15,
      });
      const filtered = (found ?? []).filter((d: any) => !skipIds.includes(d.user_id));
      if (filtered.length) {
        drivers = filtered;
        break;
      }
    }
    if (!drivers.length) return { ok: true, offers: 0, reason: "no_drivers" };

    const rows = drivers.map((d: any) => ({
      request_id: req.id,
      provider_id: d.user_id,
      distance_km: d.distance_km,
      expires_at: new Date(Date.now() + 45_000).toISOString(),
      status: "pending",
    }));
    await (supabaseAdmin as any).from("request_offers").upsert(rows, {
      onConflict: "request_id,provider_id",
    });
    const notifs = drivers.map((d: any) => ({
      user_id: d.user_id,
      type: "new_offer",
      title: "طلب جديد قريب منك",
      body: `على بُعد ${Number(d.distance_km).toFixed(1)} كم`,
      data: { request_id: req.id },
    }));
    await (supabaseAdmin as any).from("notifications").insert(notifs);
    return { ok: true, offers: drivers.length };
  });
