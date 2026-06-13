import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Car, Check, Crown, Sparkles, Wallet } from "lucide-react";

export const Route = createFileRoute("/onboarding/driver")({
  ssr: false,
  component: OnboardingDriver,
});

type VehicleModel = {
  id: string;
  make: string;
  model: string;
  category: "economy" | "premium" | "luxury";
  base_fare: number;
  per_km: number;
};

const CATEGORY_META: Record<string, { label: string; emoji: string; gradient: string; icon: any; desc: string }> = {
  economy: { label: "ممنون اقتصادي", emoji: "🚗", gradient: "from-emerald-400 to-teal-500", icon: Wallet, desc: "موديلات موفرة وعملية" },
  premium: { label: "ممنون المتميز",  emoji: "🚙", gradient: "from-sky-500 to-indigo-600", icon: Sparkles, desc: "موديلات حديثة ومتوسطة" },
  luxury:  { label: "ممنون فاخر",     emoji: "🏎️", gradient: "from-amber-400 to-orange-500", icon: Crown, desc: "سيارات فاخرة وراقية" },
};

function OnboardingDriver() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [makeFilter, setMakeFilter] = useState<string>("");
  const [selected, setSelected] = useState<VehicleModel | null>(null);
  const [year, setYear] = useState<string>(String(new Date().getFullYear() - 1));
  const [plate, setPlate] = useState("");
  const [color, setColor] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("vehicle_models").select("*").order("category").order("make").then(({ data }) => {
      setModels((data ?? []) as VehicleModel[]);
    });
  }, []);

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;

  const makes = Array.from(new Set(models.map((m) => m.make)));
  const filtered = makeFilter ? models.filter((m) => m.make === makeFilter) : models;

  async function submit() {
    if (!selected) { toast.error("اختر موديل السيارة"); return; }
    if (!plate.trim()) { toast.error("أدخل رقم اللوحة"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from("driver_profiles").upsert({
        user_id: session!.user.id,
        vehicle_make: selected.make,
        vehicle_model: selected.model,
        vehicle_year: Number(year) || null,
        vehicle_category: selected.category,
        vehicle_plate: plate.trim(),
        vehicle_color: color.trim() || null,
        available: true,
      });
      if (error) throw error;
      toast.success(`تم تفعيل ملفك — ${CATEGORY_META[selected.category].label}`);
      navigate({ to: "/home" });
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    } finally {
      setBusy(false);
    }
  }

  const cat = selected ? CATEGORY_META[selected.category] : null;

  return (
    <div className="min-h-screen px-5 pt-10 pb-32">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 grid place-items-center shadow-card">
          <Car className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black">ملف الكابتن</h1>
          <p className="text-xs text-muted-foreground">اختر سيارتك — وسنحدد فئتها تلقائياً</p>
        </div>
      </div>

      {/* Category preview */}
      {cat && selected && (
        <div className={`mb-4 rounded-3xl p-4 bg-gradient-to-br ${cat.gradient} text-white shadow-lg`}>
          <div className="flex items-center gap-3">
            <div className="text-3xl">{cat.emoji}</div>
            <div className="flex-1 min-w-0">
              <div className="text-xs opacity-90">فئتك</div>
              <div className="font-black text-lg">{cat.label}</div>
              <div className="text-[11px] opacity-90">{cat.desc}</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-white/20 py-2">
              <div className="text-[10px] opacity-80">السعر الأساسي</div>
              <div className="font-black text-sm">{Number(selected.base_fare).toLocaleString()} د.ع</div>
            </div>
            <div className="rounded-xl bg-white/20 py-2">
              <div className="text-[10px] opacity-80">لكل كيلومتر</div>
              <div className="font-black text-sm">{Number(selected.per_km).toLocaleString()} د.ع</div>
            </div>
          </div>
        </div>
      )}

      {/* Make filter */}
      <div className="mb-2 text-xs font-bold text-muted-foreground">الشركة المصنعة</div>
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-5 px-5 mb-3">
        <button onClick={() => setMakeFilter("")} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold btn-press ${!makeFilter ? "bg-primary text-primary-foreground" : "glass"}`}>الكل</button>
        {makes.map((m) => (
          <button key={m} onClick={() => setMakeFilter(m)} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold btn-press ${makeFilter === m ? "bg-primary text-primary-foreground" : "glass"}`}>{m}</button>
        ))}
      </div>

      {/* Models grid */}
      <div className="mb-2 text-xs font-bold text-muted-foreground">الموديل</div>
      <div className="grid grid-cols-2 gap-2 mb-5">
        {filtered.map((m) => {
          const c = CATEGORY_META[m.category];
          const active = selected?.id === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setSelected(m)}
              className={`relative text-right p-3 rounded-2xl btn-press transition-all ${active ? "bg-white ring-2 ring-primary shadow-md scale-[1.02]" : "bg-white/70"}`}
            >
              {active && <Check className="absolute top-2 left-2 h-4 w-4 text-primary" />}
              <div className="flex items-center gap-2">
                <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${c.gradient} grid place-items-center text-lg shadow`}>{c.emoji}</div>
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground truncate">{m.make}</div>
                  <div className="font-black text-sm truncate">{m.model}</div>
                </div>
              </div>
              <div className="mt-2 text-[10px] font-bold text-muted-foreground">{c.label}</div>
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        <Field label="سنة الصنع" value={year} onChange={setYear} placeholder="2022" />
        <Field label="رقم اللوحة" value={plate} onChange={setPlate} placeholder="مثال: 12345 بغداد" />
        <Field label="لون السيارة (اختياري)" value={color} onChange={setColor} placeholder="مثال: أبيض" />
      </div>

      <div className="fixed bottom-0 inset-x-0 p-4 glass-strong border-t border-border">
        <button
          disabled={busy || !selected}
          onClick={submit}
          className="w-full max-w-md mx-auto py-4 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-bold btn-press glow-primary disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="h-5 w-5 animate-spin" />}
          حفظ والمتابعة
          <ArrowLeft className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <div className="text-xs font-bold text-muted-foreground mb-2">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-input border border-border rounded-2xl px-4 py-3.5 text-sm font-bold outline-none focus:border-ring"
      />
    </label>
  );
}
