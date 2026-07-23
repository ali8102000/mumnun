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
  const { session, loading, refresh } = useAuth();
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
      }, { onConflict: "user_id" });
      if (error) throw error;

      const { error: roleErr } = await supabase.from("user_roles").insert({
        user_id: session!.user.id, role: "driver",
      });
      if (roleErr && !roleErr.message.toLowerCase().includes("duplicate")) throw roleErr;

      await refresh();
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
      <h1 className="text-3xl font-black">ملف الكابتن</h1>
      <p className="text-sm text-muted-foreground mt-2 mb-6">اختر سيارتك — وسنحدد فئتها تلقائياً</p>

      {cat && selected && (
        <div className={`rounded-3xl p-4 mb-5 bg-gradient-to-br ${cat.gradient} text-white shadow-elegant animate-pop-in`}>
          <div className="flex items-center gap-3">
            <div className="text-4xl">{cat.emoji}</div>
            <div>
              <div className="text-xs opacity-80">فئتك</div>
              <div className="font-black text-lg">{cat.label}</div>
              <div className="text-[11px] opacity-80">{cat.desc}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="bg-white/15 rounded-2xl p-2.5">
              <div className="text-[10px] opacity-80">السعر الأساسي</div>
              <div className="font-black">{Number(selected.base_fare).toLocaleString()} د.ع</div>
            </div>
            <div className="bg-white/15 rounded-2xl p-2.5">
              <div className="text-[10px] opacity-80">لكل كيلومتر</div>
              <div className="font-black">{Number(selected.per_km).toLocaleString()} د.ع</div>
            </div>
          </div>
        </div>
      )}

      <div className="mb-3">
        <div className="text-xs font-bold text-muted-foreground mb-2">الشركة المصنعة</div>
        <div className="flex flex-wrap gap-2">
          {makes.map((m) => (
            <button key={m} onClick={() => setMakeFilter(m === makeFilter ? "" : m)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold btn-press ${makeFilter === m ? "bg-primary text-primary-foreground" : "glass"}`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <div className="text-xs font-bold text-muted-foreground mb-2">الموديل</div>
        <div className="grid grid-cols-2 gap-2.5">
          {filtered.map((m) => {
            const c = CATEGORY_META[m.category];
            const active = selected?.id === m.id;
            return (
              <button key={m.id} onClick={() => setSelected(m)}
                className={`glass rounded-2xl p-3 text-right btn-press transition ${active ? "ring-2 ring-primary glow-primary" : ""}`}>
                <div className="text-sm font-black">{m.make} {m.model}</div>
                <div className={`inline-flex items-center gap-1 mt-1 text-[10px] font-bold bg-gradient-to-r ${c.gradient} bg-clip-text text-transparent`}>
                  {c.emoji} {c.label}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 mb-6">
        <Field label="سنة الصنع" value={year} onChange={setYear} placeholder="2023" />
        <Field label="رقم اللوحة" value={plate} onChange={setPlate} placeholder="بغداد ١٢٣٤٥" />
        <Field label="اللون (اختياري)" value={color} onChange={setColor} placeholder="أبيض" />
      </div>

      <div className="fixed bottom-0 inset-x-0 p-4 glass-strong border-t border-border">
        <button disabled={busy} onClick={submit}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-bold btn-press glow-primary disabled:opacity-50 flex items-center justify-center gap-2 max-w-md mx-auto">
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
    <div>
      <div className="text-xs font-bold text-muted-foreground mb-1.5">{label}</div>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-input border border-border rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-ring" />
    </div>
  );
}
