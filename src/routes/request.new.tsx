import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowLeft, MapPin, CheckCircle2, User, Users } from "lucide-react";
import { MapPicker } from "@/components/map-picker";
import { dispatchRequest } from "@/lib/dispatch.functions";
import { useNearbyProviders } from "@/lib/use-nearby-providers";
import { lookupMapPlace } from "@/lib/maps.functions";
import { taxiFare, approxRoadKm, FARE_TABLE } from "@/lib/taxi-fares";

const search = z.object({ type: z.enum(["taxi", "service"]).default("taxi") });

export const Route = createFileRoute("/request/new")({
  ssr: false,
  head: () => ({ meta: [
    { title: "طلب جديد | ممنون" },
    { name: "description", content: "اختر موقعك وخدمتك لإنشاء طلب جديد في ممنون." },
    { property: "og:title", content: "طلب جديد | ممنون" },
    { property: "og:description", content: "اختر موقعك وخدمتك لإنشاء طلب جديد في ممنون." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  validateSearch: search,
  component: NewRequest,
});

type Service = { id: string; slug: string; name_ar: string };

const SERVICE_VISUALS: Record<string, { emoji: string; gradient: string }> = {
  build:            { emoji: "🧱", gradient: "from-orange-400 to-red-500" },
  plaster:          { emoji: "🪣", gradient: "from-amber-400 to-orange-500" },
  carpentry_form:   { emoji: "📐", gradient: "from-yellow-400 to-amber-600" },
  flooring:         { emoji: "🟫", gradient: "from-stone-400 to-stone-600" },
  chef:             { emoji: "👨‍🍳", gradient: "from-rose-400 to-pink-600" },
  plumbing:         { emoji: "🚰", gradient: "from-sky-400 to-blue-600" },
  electric_setup:   { emoji: "💡", gradient: "from-yellow-300 to-amber-500" },
  electric_street:  { emoji: "⚡", gradient: "from-yellow-400 to-orange-500" },
  washer_repair:    { emoji: "🧺", gradient: "from-cyan-400 to-blue-500" },
  stove_repair:     { emoji: "🔥", gradient: "from-orange-500 to-red-600" },
  fridge_repair:    { emoji: "🧊", gradient: "from-cyan-300 to-sky-500" },
  ac_repair:        { emoji: "❄️", gradient: "from-sky-300 to-cyan-500" },
  cleaning:         { emoji: "✨", gradient: "from-emerald-400 to-teal-500" },
  wood_carpentry:   { emoji: "🪵", gradient: "from-amber-600 to-yellow-800" },
  blacksmith:       { emoji: "⚒️", gradient: "from-slate-500 to-zinc-700" },
  general:          { emoji: "🏠", gradient: "from-indigo-400 to-purple-500" },
  goods_transport:  { emoji: "📦", gradient: "from-amber-500 to-orange-600" },
  furniture_moving: { emoji: "🛋️", gradient: "from-fuchsia-400 to-pink-600" },
  cargo_handling:   { emoji: "🚚", gradient: "from-blue-500 to-indigo-600" },
};

const DEFAULT_VISUAL = { emoji: "🛠️", gradient: "from-primary to-primary-glow" };

type VehicleCategory = "economy" | "premium" | "luxury";
const VEHICLE_CATS: { key: VehicleCategory; label: string; emoji: string; gradient: string; eta: string }[] = [
  { key: "economy", label: "ممنون اقتصادي", emoji: "🚗", gradient: "from-emerald-400 to-teal-500", eta: "3-5 د" },
  { key: "premium", label: "ممنون المتميز", emoji: "🚙", gradient: "from-sky-500 to-indigo-600", eta: "4-6 د" },
  { key: "luxury",  label: "ممنون فاخر",   emoji: "🏎️", gradient: "from-amber-400 to-orange-500", eta: "5-8 د" },
];

function shortAddr(address: string) {
  const normalized = address.trim();
  return normalized.length > 42 ? `${normalized.slice(0, 39)}…` : normalized;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function NewRequest() {
  const { type } = Route.useSearch();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const runDispatch = useServerFn(dispatchRequest);
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [level, setLevel] = useState<"fani" | "khabir">("fani");
  const [khabirMode, setKhabirMode] = useState<"alone" | "with_workers">("alone");
  const [workersCount, setWorkersCount] = useState(1);
  const [vehicleCategory, setVehicleCategory] = useState<VehicleCategory>("economy");

  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pickupLabel, setPickupLabel] = useState("");
  const [locating, setLocating] = useState(false);

  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destLabel, setDestLabel] = useState("");
  const [destText, setDestText] = useState("");
  const [mapStep, setMapStep] = useState<"pickup" | "dest">("pickup");
  const [review, setReview] = useState(false);
  const pickupRef = useRef(pickupCoords);
  pickupRef.current = pickupCoords;

  const [notes, setNotes] = useState("");
  const [pricingMode, setPricingMode] = useState<"fixed" | "hourly" | "negotiable">("fixed");
  const [customerPrice, setCustomerPrice] = useState("");
  const [workHours, setWorkHours] = useState("");
  const [workDescription, setWorkDescription] = useState("");
  const [routeKm, setRouteKm] = useState<number | null>(null);

  useEffect(() => {
    if (!pickupCoords || !destCoords) { setRouteKm(null); return; }
    let stale = false;
    setRouteKm(approxRoadKm(haversineKm(pickupCoords, destCoords)));
    const t = setTimeout(() => {
      lookupMapPlace({ data: { action: "route", from: pickupCoords, to: destCoords } })
        .then((r: any) => { if (!stale && r?.distanceKm > 0) setRouteKm(r.distanceKm); })
        .catch(() => {});
    }, 400);
    return () => { stale = true; clearTimeout(t); };
  }, [pickupCoords?.lat, pickupCoords?.lng, destCoords?.lat, destCoords?.lng]);
  const [busy, setBusy] = useState(false);

  const nearby = useNearbyProviders({
    center: pickupCoords,
    type,
    category: type === "taxi" ? vehicleCategory : null,
    serviceId: type === "service" ? serviceId : null,
    radiusKm: 5,
    enabled: !!pickupCoords,
  });


  useEffect(() => {
    if (type === "service") {
      supabase.from("services").select("id, slug, name_ar").order("sort_order").then(({ data }) => {
        setServices((data ?? []) as Service[]);
      });
    }
  }, [type]);



  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;

  async function submit() {
    if (!pickupCoords) { toast.error("شارك موقع الانطلاق"); return; }
    if (type === "taxi" && !destCoords && !destText.trim()) { toast.error("حدد الوجهة"); return; }
    if (type === "service" && !serviceId) { toast.error("اختر الخدمة"); return; }

    const finalWorkers =
      type === "service" && level === "khabir"
        ? (khabirMode === "alone" ? 1 : 1 + workersCount)
        : workersCount;

    let priceEstimate: number | null = null;
    if (type === "taxi" && routeKm !== null) {
      priceEstimate = taxiFare(vehicleCategory, routeKm);
    }
    const priceNum = parseInt(customerPrice.replace(/[^0-9]/g, ""), 10);
    if (type === "service" && pricingMode !== "negotiable" && !(priceNum > 0)) {
      toast.error("اكتب المبلغ اللي تريد تدفعه");
      return;
    }
    if (type === "service" && pricingMode !== "negotiable" && priceNum % 250 !== 0) {
      toast.error("المبلغ لازم يكون من مضاعفات 250 دينار");
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.from("service_requests").insert({
        customer_id: session!.user.id,
        type,
        status: "pending",
        service_id: type === "service" ? serviceId : null,
        level_required: type === "service" ? level : null,
        workers_count: finalWorkers,
        vehicle_category: type === "taxi" ? vehicleCategory : null,
        price_estimate: priceEstimate,
        pickup_text: pickupLabel,
        pickup_lat: pickupCoords?.lat ?? null,
        pickup_lng: pickupCoords?.lng ?? null,
        dest_text: destLabel || destText || null,
        dest_lat: destCoords?.lat ?? null,
        dest_lng: destCoords?.lng ?? null,
        notes: notes || null,
        distance_km: type === "taxi" && routeKm !== null ? Number(routeKm.toFixed(2)) : null,
        ...(type === "service" ? {
          pricing_mode: pricingMode,
          customer_price: pricingMode === "negotiable" ? null : priceNum,
          work_hours: pricingMode === "hourly" && workHours ? Number(workHours) : null,
          work_description: workDescription.trim() || null,
        } : {}),
      } as any).select("id").single();
      if (error) throw error;
      toast.success("تم إرسال الطلب");
      if (type === "taxi") {
        runDispatch({ data: { requestId: data.id } }).catch((e) => console.warn("[dispatch]", e));
      }
      navigate({ to: "/request/$id", params: { id: data.id } });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  const selectedService = services.find((s) => s.id === serviceId);

  return (
    <div className="min-h-screen px-5 pt-10 pb-36">
      <button onClick={() => window.history.length > 1 ? history.back() : navigate({ to: "/home" })} className="text-sm text-muted-foreground mb-4 flex items-center gap-1">
        رجوع
      </button>
      <h1 className="text-3xl font-black">
        {type === "taxi" ? "🚕 طلب سيارة" : "🛠️ طلب خدمة"}
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        {type === "taxi" ? "شارك موقعك وحدد وجهتك" : "اختر الخدمة بسهولة"}
      </p>

      {type === "service" && (
        <>
          <div className="mt-6 mb-3 text-sm font-bold text-muted-foreground">اختر الخدمة</div>
          <div className="grid grid-cols-3 gap-3 mb-6">
            {services.map((s) => {
              const v = SERVICE_VISUALS[s.slug] ?? DEFAULT_VISUAL;
              const active = serviceId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setServiceId(s.id)}
                  className={`relative flex flex-col items-center gap-2 p-3 rounded-2xl btn-press tap-highlight-none transition-all ${
                    active
                      ? "bg-white ring-2 ring-primary shadow-lg scale-105"
                      : "bg-white/70 hover:bg-white"
                  }`}
                >
                  {active && (
                    <CheckCircle2 className="absolute top-1.5 left-1.5 h-4 w-4 text-primary fill-white" />
                  )}
                  <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${v.gradient} flex items-center justify-center text-2xl shadow-md`}>
                    {v.emoji}
                  </div>
                  <div className="text-[11px] font-bold text-center leading-tight min-h-[28px]">
                    {s.name_ar}
                  </div>
                </button>
              );
            })}
          </div>

          {selectedService && (
            <div className="glass rounded-2xl p-3 mb-5 flex items-center gap-3">
              <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${(SERVICE_VISUALS[selectedService.slug] ?? DEFAULT_VISUAL).gradient} flex items-center justify-center text-xl`}>
                {(SERVICE_VISUALS[selectedService.slug] ?? DEFAULT_VISUAL).emoji}
              </div>
              <div className="text-sm font-bold">{selectedService.name_ar}</div>
            </div>
          )}

          <div className="mb-2 text-sm font-bold text-muted-foreground">المستوى المطلوب</div>
          <div className="grid grid-cols-2 gap-3 mb-5">
            {([
              { k: "fani", label: "فني", emoji: "🔧", desc: "خبرة جيدة" },
              { k: "khabir", label: "خبير", emoji: "⭐", desc: "خبرة عالية" },
            ] as const).map((opt) => (
              <button
                key={opt.k}
                onClick={() => setLevel(opt.k)}
                className={`p-4 rounded-2xl btn-press text-center transition-all ${
                  level === opt.k
                    ? "bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-lg scale-105"
                    : "bg-white/70"
                }`}
              >
                <div className="text-2xl mb-1">{opt.emoji}</div>
                <div className="font-black text-sm">{opt.label}</div>
                <div className={`text-[10px] mt-0.5 ${level === opt.k ? "opacity-90" : "text-muted-foreground"}`}>{opt.desc}</div>
              </button>
            ))}
          </div>

          {level === "khabir" ? (
            <>
              <div className="mb-2 text-sm font-bold text-muted-foreground">الخبير يحتاج عمال؟</div>
              <div className="grid grid-cols-2 gap-3 mb-5">
                <button
                  onClick={() => setKhabirMode("alone")}
                  className={`p-4 rounded-2xl btn-press transition-all ${
                    khabirMode === "alone"
                      ? "bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-lg scale-105"
                      : "bg-white/70"
                  }`}
                >
                  <User className="h-6 w-6 mx-auto mb-1" />
                  <div className="font-black text-sm">خبير فقط</div>
                  <div className={`text-[10px] mt-0.5 ${khabirMode === "alone" ? "opacity-90" : "text-muted-foreground"}`}>بدون عمال</div>
                </button>
                <button
                  onClick={() => setKhabirMode("with_workers")}
                  className={`p-4 rounded-2xl btn-press transition-all ${
                    khabirMode === "with_workers"
                      ? "bg-gradient-to-br from-fuchsia-400 to-purple-500 text-white shadow-lg scale-105"
                      : "bg-white/70"
                  }`}
                >
                  <Users className="h-6 w-6 mx-auto mb-1" />
                  <div className="font-black text-sm">خبير + عمال</div>
                  <div className={`text-[10px] mt-0.5 ${khabirMode === "with_workers" ? "opacity-90" : "text-muted-foreground"}`}>طاقم متكامل</div>
                </button>
              </div>
              {khabirMode === "with_workers" && (
                <>
                  <div className="mb-2 text-sm font-bold text-muted-foreground">عدد العمال المساعدين</div>
                  <div className="flex items-center gap-3 mb-5 glass rounded-2xl p-3">
                    <button onClick={() => setWorkersCount(Math.max(1, workersCount - 1))} className="h-10 w-10 rounded-xl bg-surface-2 font-black btn-press">−</button>
                    <div className="flex-1 text-center font-black text-2xl">{workersCount}</div>
                    <button onClick={() => setWorkersCount(Math.min(10, workersCount + 1))} className="h-10 w-10 rounded-xl bg-primary text-primary-foreground font-black btn-press">+</button>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="mb-2 text-sm font-bold text-muted-foreground">عدد العمال المطلوب</div>
              <div className="flex items-center gap-3 mb-5 glass rounded-2xl p-3">
                <button onClick={() => setWorkersCount(Math.max(1, workersCount - 1))} className="h-10 w-10 rounded-xl bg-surface-2 font-black btn-press">−</button>
                <div className="flex-1 text-center font-black text-2xl">{workersCount}</div>
                <button onClick={() => setWorkersCount(Math.min(10, workersCount + 1))} className="h-10 w-10 rounded-xl bg-primary text-primary-foreground font-black btn-press">+</button>
              </div>
            </>
          )}
        </>
      )}

      <div className="mt-2 mb-2 flex items-center gap-2">
        <button type="button" onClick={() => { setReview(false); setMapStep("pickup"); }} className={`flex-1 py-2.5 rounded-2xl text-sm font-bold transition-all btn-press ${mapStep === "pickup" ? "bg-sky-600 text-white shadow-lg" : "bg-white/70 text-muted-foreground"}`}>
          ١. {type === "taxi" ? "الانطلاق" : "موقع الخدمة"}
        </button>
        {type === "taxi" && (
          <button type="button" onClick={() => { setReview(false); setMapStep("dest"); }} className={`flex-1 py-2.5 rounded-2xl text-sm font-bold transition-all btn-press ${mapStep === "dest" ? "bg-rose-600 text-white shadow-lg" : "bg-white/70 text-muted-foreground"}`}>
            ٢. الوجهة
          </button>
        )}
      </div>
      <div className="mb-2 text-xs text-muted-foreground">
        الخريطه تفتح بشاشه كامله. حدد موقعك تلقائيا او من البحث، وبعدها تنتقل تلقائيا لتحديد الوجهه.
      </div>
      <MapPicker
        key={`${mapStep}-${review ? "review" : "map"}`}
        value={mapStep === "pickup" ? pickupCoords : destCoords}
        accent={mapStep === "pickup" ? "#0284c7" : "#e11d48"}
        nearby={mapStep === "pickup" ? nearby : undefined}
        nearbyKind={type === "taxi" ? "car" : "worker"}
        autoLocateOnMount={mapStep === "pickup"}
        fallbackCenter={pickupCoords}
        startFull={!review && type === "taxi"}
        stepTitle={
          mapStep === "pickup"
            ? type === "taxi"
              ? "خطوة ١: حدد موقعك الحالي"
              : "موقع الخدمة"
            : "خطوة ٢: وين رايح؟"
        }
        onBack={
          mapStep === "dest"
            ? () => {
                setReview(false);
                setMapStep("pickup");
              }
            : undefined
        }
        placeholder={mapStep === "pickup" ? "ابحث عن موقع الانطلاق..." : "ابحث عن الوجهة..."}
        showLocateButton={mapStep === "pickup"}
        confirmLabel={mapStep === "pickup" ? (type === "taxi" ? "تأكيد الانطلاق والانتقال للوجهة" : "تأكيد موقع الخدمة") : "تأكيد الوجهة"}
        onAutoLocated={(_c, addr) => {
          if (type !== "taxi" || mapStep !== "pickup" || review) return;
          setMapStep("dest");
          toast.success(addr ? `تحديدت انطلاك من ${shortAddr(addr)} — هسه حدد وجهتك` : "تحديدت انطلاك — هسه حدد وجهتك");
        }}
        onConfirm={() => {
          if (mapStep === "pickup" && type === "taxi") {
            setMapStep("dest");
            toast.success("تم تأكيد الانطلاق، هسه حدد الوجهة");
          } else {
            setReview(true);
            toast.success(mapStep === "dest" ? "تم تأكيد الوجهة ✓" : "تم تأكيد الموقع ✓");
            setTimeout(() => document.getElementById("after-map")?.scrollIntoView({ behavior: "smooth" }), 120);
          }
        }}
        onChange={(c, addr) => {
          if (mapStep === "pickup") {
            setPickupCoords(c);
            setPickupLabel(addr ?? `موقعي (${c.lat.toFixed(4)}, ${c.lng.toFixed(4)})`);
          } else {
            const p = pickupRef.current;
            if (p && Math.abs(p.lat - c.lat) < 1e-6 && Math.abs(p.lng - c.lng) < 1e-6) return;
            setDestCoords(c);
            setDestLabel(addr ?? `وجهتي (${c.lat.toFixed(4)}, ${c.lng.toFixed(4)})`);
          }
        }}
      />
      <div id="after-map" className="mt-2 space-y-2">
        {pickupLabel && (
          <button onClick={() => { setReview(false); setMapStep("pickup"); }} className={`w-full glass rounded-2xl p-3 flex items-center gap-2 text-right transition ${mapStep === "pickup" ? "ring-2 ring-sky-500" : ""}`}>
            <MapPin className="h-4 w-4 text-sky-600 shrink-0" />
            <div className="text-xs font-bold truncate flex-1">{pickupLabel}</div>
            {mapStep === "pickup" && <CheckCircle2 className="h-4 w-4 text-sky-600 shrink-0" />}
          </button>
        )}
        {type === "taxi" && destLabel && (
          <button onClick={() => { setReview(false); setMapStep("dest"); }} className={`w-full glass rounded-2xl p-3 flex items-center gap-2 text-right transition ${mapStep === "dest" ? "ring-2 ring-rose-500" : ""}`}>
            <MapPin className="h-4 w-4 text-rose-600 shrink-0" />
            <div className="text-xs font-bold truncate flex-1">{destLabel}</div>
            {mapStep === "dest" && <CheckCircle2 className="h-4 w-4 text-rose-600 shrink-0" />}
          </button>
        )}
      </div>
      {type === "taxi" && pickupCoords && (
        <div className="mt-3 flex gap-2">
          {mapStep === "pickup" && (
            <button onClick={() => { setReview(false); setMapStep("dest"); }} className="flex-1 py-3 rounded-2xl bg-sky-600 text-white font-bold text-sm btn-press flex items-center justify-center gap-2">
              تحديد الوجهة <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          {mapStep === "dest" && (
            <button onClick={() => { setReview(false); setMapStep("pickup"); }} className="flex-1 py-3 rounded-2xl bg-surface-2 font-bold text-sm btn-press">
              العودة لموقع الانطلاق
            </button>
          )}
        </div>
      )}

      {type === "taxi" && (
        <>
          <input
            value={destText}
            onChange={(e) => setDestText(e.target.value)}
            placeholder="أو اكتب اسم المنطقة (اختياري)"
            className="mt-2 w-full bg-input border border-border rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-ring"
          />

          <div className="mt-6 mb-2 text-sm font-bold text-muted-foreground">
            🚘 اختر فئة السيارة{routeKm !== null && <span className="font-medium"> · المسافة {routeKm.toFixed(1)} كم</span>}
          </div>
          <div className="space-y-2">
            {VEHICLE_CATS.map((c) => {
              const active = vehicleCategory === c.key;
              const est = routeKm !== null ? taxiFare(c.key, routeKm) : null;
              return (
                <button
                  key={c.key}
                  onClick={() => setVehicleCategory(c.key)}
                  className={`w-full text-right p-3 rounded-2xl btn-press transition-all flex items-center gap-3 ${
                    active ? "bg-white ring-2 ring-primary shadow-lg scale-[1.01]" : "bg-white/70"
                  }`}
                >
                  <div className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${c.gradient} grid place-items-center text-2xl shadow-md shrink-0`}>
                    {c.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-sm">{c.label}</div>
                    <div className="text-[11px] text-muted-foreground">وصول خلال {c.eta}</div>
                  </div>
                  <div className="text-left shrink-0">
                    {est !== null ? (
                      <>
                        <div className="font-black text-sm">{est.toLocaleString()}</div>
                        <div className="text-[10px] text-muted-foreground">د.ع تقريبي</div>
                      </>
                    ) : (
                      <div className="text-[11px] text-muted-foreground">من {FARE_TABLE[c.key].minimum.toLocaleString()} د.ع</div>
                    )}
                  </div>
                  {active && <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        </>
      )}


      {type === "service" && (
        <div className="mt-6 glass rounded-2xl p-4 space-y-3">
          <div className="text-sm font-black">💰 السعر والشغل</div>
          <div className="grid grid-cols-3 gap-2">
            {([
              { k: "fixed", label: "إنجاز تام" },
              { k: "hourly", label: "بالساعات" },
              { k: "negotiable", label: "يحدده الفني" },
            ] as const).map((o) => (
              <button key={o.k} type="button" onClick={() => setPricingMode(o.k)}
                className={`py-3 rounded-xl text-xs font-bold btn-press ${pricingMode === o.k ? "bg-primary text-primary-foreground shadow" : "bg-surface-2"}`}>
                {o.label}
              </button>
            ))}
          </div>
          <textarea value={workDescription} onChange={(e) => setWorkDescription(e.target.value)} rows={2}
            placeholder="شنو الشغل؟ مثلاً: بناء حايط 4 متر، أو تصليح سبلت"
            className="w-full bg-input border border-border rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-ring resize-none" />
          {pricingMode === "hourly" && (
            <input inputMode="numeric" value={workHours} onChange={(e) => setWorkHours(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="عدد الساعات"
              className="w-full bg-input border border-border rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-ring" />
          )}
          {pricingMode !== "negotiable" && (
            <>
              <input inputMode="numeric" value={customerPrice} onChange={(e) => setCustomerPrice(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder={pricingMode === "hourly" ? "المبلغ الكلي (د.ع) مثلاً 25000" : "مبلغ الإنجاز التام (د.ع) مثلاً 50000"}
                className="w-full bg-input border border-border rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-ring" />
              <div className="flex flex-wrap gap-2">
                {[10000, 25000, 50000, 100000].map((v) => (
                  <button key={v} type="button" onClick={() => setCustomerPrice(String(v))} className="px-3 py-1.5 rounded-full bg-surface-2 text-xs font-bold btn-press">
                    {v.toLocaleString()}
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-muted-foreground">الفني يشوف المبلغ ويوافق عليه. المبلغ يكون من مضاعفات 250 دينار.</div>
            </>
          )}
        </div>
      )}

      <div className="mt-5">
        <div className="text-xs font-bold text-muted-foreground mb-2">📝 ملاحظات (اختياري)</div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="تفاصيل إضافية..."
          className="w-full bg-input border border-border rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-ring resize-none"
        />
      </div>

      <div className="fixed bottom-0 inset-x-0 p-4 glass-strong border-t border-border">
        <button
          disabled={busy}
          onClick={submit}
          className="w-full max-w-md mx-auto py-4 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-bold btn-press glow-primary disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="h-5 w-5 animate-spin" />}
          إرسال الطلب
          <ArrowLeft className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
