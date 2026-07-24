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

    const { data: req, error } = await supabase
      .from("service_requests")
      .select("id, customer_id, type, vehicle_category, pickup_lat, pickup_lng, status")
      .eq("id", data.requestId)
      .single();
    if (error || !req) throw new Error("Request not found");
    if (req.customer_id !== userId) throw new Error("Forbidden");
    if (req.type !== "taxi") return { offers: 0, reason: "not_taxi" };
    if (!req.pickup_lat || !req.pickup_lng) throw new Error("Missing pickup location");

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
    if (insErr) throw new Error("Failed to create offers");

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

    if (updErr) throw new Error("Failed to accept request");
    if (!updated) throw new Error("الطلب لم يعد متاحاً");

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

    await supabaseAdmin
      .from("chats")
      .upsert({ request_id: offer.request_id, customer_id: updated.customer_id, provider_id: userId } as any)
      .eq("request_id", offer.request_id)
      .select();

    await (supabaseAdmin as any).from("notifications").insert({
      user_id: updated.customer_id,
      type: "offer_accepted",
      title: "تم قبول طلبك",
      body: "الكابتن في طريقه إليك",
      link: `/request/${offer.request_id}`,
    });

    return { ok: true, accepted: true, requestId: offer.request_id };
  });

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
    await (supabaseAdmin as any)
      .from("request_offers")
      .update({ status: "expired" })
      .eq("request_id", req.id)
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString());

    const { data: active } = await (supabaseAdmin as any)
      .from("request_offers")
      .select("id")
      .eq("request_id", req.id)
      .eq("status", "pending")
      .limit(1);
    if (active && active.length) return { ok: true, offers: 0, reason: "still_pending" };

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

export const startRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: req } = await supabase
      .from("service_requests")
      .select("id, provider_id, status, customer_id")
      .eq("id", data.requestId)
      .single();
    if (!req) throw new Error("Request not found");
    if (req.provider_id !== userId) throw new Error("Forbidden");
    if (req.status !== "accepted") throw new Error("Request not in accepted state");

    await supabaseAdmin
      .from("service_requests")
      .update({ status: "in_progress", started_at: new Date().toISOString() } as any)
      .eq("id", req.id);

    await (supabaseAdmin as any).from("notifications").insert({
      user_id: req.customer_id,
      type: "ride_started",
      title: "بدأت الرحلة",
      body: "الكابتن بدأ الرحلة",
      link: `/request/${req.id}`,
    });

    return { ok: true };
  });

export const completeRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: req } = await supabase
      .from("service_requests")
      .select("id, provider_id, status, customer_id, price_estimate")
      .eq("id", data.requestId)
      .single();
    if (!req) throw new Error("Request not found");
    if (req.provider_id !== userId) throw new Error("Forbidden");
    if (req.status !== "in_progress") throw new Error("Request not in progress");

    await supabaseAdmin
      .from("service_requests")
      .update({ status: "completed" as any, completed_at: new Date().toISOString() })
      .eq("id", req.id);

    if (req.price_estimate) {
      const { data: wallet } = await (supabaseAdmin as any)
        .from("driver_wallets")
        .select("balance, total_earned, total_commission")
        .eq("user_id", userId)
        .maybeSingle();

      if (wallet) {
        const commission = Math.round(Number(req.price_estimate) * 0.1);
        const net = Number(req.price_estimate) - commission;
        await (supabaseAdmin as any)
          .from("driver_wallets")
          .update({
            balance: Number(wallet.balance) + net,
            total_earned: Number(wallet.total_earned) + net,
            total_commission: Number(wallet.total_commission) + commission,
          })
          .eq("user_id", userId);

        await (supabaseAdmin as any).from("transactions").insert({
          user_id: userId,
          request_id: req.id,
          type: "earnings",
          amount: net,
          note: `أرباح رحلة #${req.id.slice(0, 8)}`,
        });
      }
    }

    await (supabaseAdmin as any).from("notifications").insert({
      user_id: req.customer_id,
      type: "ride_completed",
      title: "تم إنهاء الرحلة",
      body: "وصلت إلى وجهتك. يرجى تقييم الخدمة.",
      link: `/request/${req.id}`,
    });

    return { ok: true };
  });

export const acceptServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: updated, error } = await supabaseAdmin
      .from("service_requests")
      .update({
        provider_id: userId,
        status: "accepted" as any,
        accepted_at: new Date().toISOString(),
      })
      .eq("id", data.requestId)
      .eq("status", "pending")
      .select("id, customer_id")
      .maybeSingle();

    if (error) throw new Error("Failed to grant role");
    if (!updated) throw new Error("الطلب لم يعد متاحاً");

    await supabaseAdmin
      .from("chats")
      .upsert({
        request_id: data.requestId,
        customer_id: updated.customer_id,
        provider_id: userId,
      } as any)
      .eq("request_id", data.requestId);

    await (supabaseAdmin as any).from("notifications").insert({
      user_id: updated.customer_id,
      type: "offer_accepted",
      title: "تم قبول طلبك",
      body: "المزود في طريقه إليك",
      link: `/request/${data.requestId}`,
    });

    return { ok: true, requestId: data.requestId };
  });
