import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Car } from "lucide-react";

export const Route = createFileRoute("/onboarding/driver")({
  ssr: false,
  component: OnboardingDriver,
});

function OnboardingDriver() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [model, setModel] = useState("");
  const [plate, setPlate] = useState("");
  const [color, setColor] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;

  async function submit() {
    if (!model.trim() || !plate.trim()) {
      toast.error("الرجاء إكمال بيانات السيارة");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("driver_profiles").upsert({
        user_id: session!.user.id,
        vehicle_model: model.trim(),
        vehicle_plate: plate.trim(),
        vehicle_color: color.trim() || null,
        available: true,
      });
      if (error) throw error;
      toast.success("تم تفعيل ملفك");
      navigate({ to: "/home" });
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen px-5 pt-10 pb-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-500 to-yellow-400 grid place-items-center shadow-card">
          <Car className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black">ملف الكابتن</h1>
          <p className="text-xs text-muted-foreground">أدخل بيانات السيارة</p>
        </div>
      </div>

      <div className="space-y-3">
        <Field label="موديل السيارة" value={model} onChange={setModel} placeholder="مثال: تويوتا كورولا 2020" />
        <Field label="رقم اللوحة" value={plate} onChange={setPlate} placeholder="مثال: 12345 بغداد" />
        <Field label="لون السيارة (اختياري)" value={color} onChange={setColor} placeholder="مثال: أبيض" />
      </div>

      <button
        disabled={busy}
        onClick={submit}
        className="mt-8 w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-bold btn-press glow-primary disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy && <Loader2 className="h-5 w-5 animate-spin" />}
        حفظ والمتابعة
        <ArrowLeft className="h-5 w-5" />
      </button>
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
