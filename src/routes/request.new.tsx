import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowLeft, MapPin, Navigation, CheckCircle2, User, Users } from "lucide-react";
import { MapPicker } from "@/components/map-picker";

const search = z.object({ type: z.enum(["taxi", "service"]).default("taxi") });

export const Route = createFileRoute("/request/new")({
  ssr: false,
  validateSearch: search,
  component: NewRequest,
});

type Service = { id: string; slug: string; name_ar: string };

// Colorful icon mapping per service slug
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

function NewRequest() {
  const { type } = Route.useSearch();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [level, setLevel] = useState<"fani" | "khabir">("fani");
  // For khabir: choose alone or with helpers
  const [khabirMode, setKhabirMode] = useState<"alone" | "with_workers">("alone");
  const [workersCount, setWorkersCount] = useState(1);

  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pickupLabel, setPickupLabel] = useState("");
  const [locating, setLocating] = useState(false);

  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destLabel, setDestLabel] = useState("");
  const [destText, setDestText] = useState("");

  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (type === "service") {
      supabase.from("services").select("id, slug, name_ar").order("sort_order").then(({ data }) => {
        setServices((data ?? []) as Service[]);
      });
    }
  }, [type]);

  function shareLocation(target: "pickup" | "dest") {
    if (!navigator.geolocation) {
      toast.error("المتصفح لا يدعم تحديد الموقع");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const label = `موقعي الحالي (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`;
        if (target === "pickup") { setPickupCoords(coords); setPickupLabel(label); }
        else { setDestCoords(coords); setDestLabel(label); }
        setLocating(false);
        toast.success("تمت مشاركة الموقع");
      },
      (err) => {
        setLocating(false);
        toast.error(err.code === 1 ? "يرجى السماح بالوصول للموقع" : "تعذّر تحديد الموقع");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;

  async function submit() {
    if (!pickupCoords) { toast.error("شارك موقع الانطلاق"); return; }
    if (type === "taxi" && !destCoords && !destText.trim()) { toast.error("حدد الوجهة"); return; }
    if (type === "service" && !serviceId) { toast.error("اختر الخدمة"); return; }

    const finalWorkers =
      type === "service" && level === "khabir"
        ? (khabirMode === "alone" ? 1 : 1 + workersCount) // 1 khabir + N helpers
        : workersCount;

    setBusy(true);
    try {
      const { data, error } = await supabase.from("service_requests").insert({
        customer_id: session!.user.id,
        type,
        status: "pending",
        service_id: type === "service" ? serviceId : null,
        level_required: type === "service" ? level : null,
        workers_count: finalWorkers,
        pickup_text: pickupLabel,
        pickup_lat: pickupCoords.lat,
        pickup_lng: pickupCoords.lng,
        dest_text: destLabel || destText || null,
        dest_lat: destCoords?.lat ?? null,
        dest_lng: destCoords?.lng ?? null,
        notes: notes || null,
      }).select("id").single();
      if (error) throw error;
      toast.success("تم إرسال الطلب");
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
      <button onClick={() => history.back()} className="text-sm text-muted-foreground mb-4 flex items-center gap-1">
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

      {/* Location selection on map */}
      <div className="mt-2 mb-2 text-sm font-bold text-muted-foreground">
        {type === "taxi" ? "📍 موقع الانطلاق — حرّك المؤشر أو اضغط على الخريطة" : "📍 موقع الخدمة — حدّد على الخريطة"}
      </div>
      <MapPicker
        value={pickupCoords}
        accent="#0284c7"
        onChange={(c, addr) => {
          setPickupCoords(c);
          setPickupLabel(addr ?? `موقعي (${c.lat.toFixed(4)}, ${c.lng.toFixed(4)})`);
        }}
      />
      {pickupLabel && (
        <div className="mt-2 glass rounded-2xl p-3 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-sky-600 shrink-0" />
          <div className="text-xs font-bold truncate">{pickupLabel}</div>
        </div>
      )}

      {type === "taxi" && (
        <>
          <div className="mt-5 mb-2 text-sm font-bold text-muted-foreground">🎯 الوجهة — حدّدها على الخريطة</div>
          <MapPicker
            value={destCoords}
            accent="#e11d48"
            onChange={(c, addr) => {
              setDestCoords(c);
              setDestLabel(addr ?? `وجهتي (${c.lat.toFixed(4)}, ${c.lng.toFixed(4)})`);
            }}
          />
          {destLabel && (
            <div className="mt-2 glass rounded-2xl p-3 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-rose-600 shrink-0" />
              <div className="text-xs font-bold truncate">{destLabel}</div>
            </div>
          )}

          <input
            value={destText}
            onChange={(e) => setDestText(e.target.value)}
            placeholder="أو اكتب اسم المنطقة (اختياري)"
            className="mt-2 w-full bg-input border border-border rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-ring"
          />
        </>
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

function LocationCard({
  coords, label, loading, onShare, color,
}: {
  coords: { lat: number; lng: number } | null;
  label: string;
  loading: boolean;
  onShare: () => void;
  color: string;
}) {
  if (coords) {
    return (
      <div className="glass rounded-2xl p-4 flex items-center gap-3">
        <div className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center shadow-md`}>
          <MapPin className="h-6 w-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-black truncate">{label}</div>
          <div className="text-[11px] text-muted-foreground">تمت المشاركة ✓</div>
        </div>
        <button onClick={onShare} className="text-xs font-bold text-primary btn-press px-2">
          تغيير
        </button>
      </div>
    );
  }
  return (
    <button
      onClick={onShare}
      disabled={loading}
      className={`w-full rounded-2xl p-5 bg-gradient-to-br ${color} text-white shadow-lg btn-press flex items-center justify-center gap-3 disabled:opacity-60`}
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Navigation className="h-5 w-5" />}
      <span className="font-black">شارك موقعك الآن</span>
    </button>
  );
}
