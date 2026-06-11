import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowLeft, MapPin } from "lucide-react";

const search = z.object({ type: z.enum(["taxi", "service"]).default("taxi") });

export const Route = createFileRoute("/request/new")({
  ssr: false,
  validateSearch: search,
  component: NewRequest,
});

function NewRequest() {
  const { type } = Route.useSearch();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState<{ id: string; name_ar: string }[]>([]);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [level, setLevel] = useState<"fani" | "khabir">("fani");
  const [workersCount, setWorkersCount] = useState(1);
  const [pickup, setPickup] = useState("");
  const [dest, setDest] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (type === "service") {
      supabase.from("services").select("id, name_ar").order("sort_order").then(({ data }) => {
        setServices(data ?? []);
        if (data?.[0]) setServiceId(data[0].id);
      });
    }
  }, [type]);

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;

  async function submit() {
    if (!pickup.trim()) { toast.error("أدخل عنوان الموقع"); return; }
    if (type === "taxi" && !dest.trim()) { toast.error("أدخل الوجهة"); return; }
    if (type === "service" && !serviceId) { toast.error("اختر الخدمة"); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.from("service_requests").insert({
        customer_id: session!.user.id,
        type,
        status: "pending",
        service_id: type === "service" ? serviceId : null,
        level_required: type === "service" ? level : null,
        workers_count: workersCount,
        pickup_text: pickup,
        dest_text: dest || null,
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

  return (
    <div className="min-h-screen px-5 pt-10 pb-32">
      <button onClick={() => history.back()} className="text-sm text-muted-foreground mb-4 flex items-center gap-1">
        رجوع
      </button>
      <h1 className="text-3xl font-black">{type === "taxi" ? "طلب سيارة" : "طلب فني"}</h1>

      {type === "service" && (
        <>
          <div className="mt-6 mb-2 text-sm font-bold text-muted-foreground">الخدمة</div>
          <div className="grid grid-cols-2 gap-2 mb-5">
            {services.map((s) => (
              <button
                key={s.id}
                onClick={() => setServiceId(s.id)}
                className={`glass rounded-2xl p-3 text-xs font-bold text-right btn-press tap-highlight-none ${
                  serviceId === s.id ? "ring-2 ring-primary text-primary" : ""
                }`}
              >
                {s.name_ar}
              </button>
            ))}
          </div>

          <div className="mb-2 text-sm font-bold text-muted-foreground">المستوى</div>
          <div className="flex bg-surface-2 rounded-2xl p-1 mb-5 text-xs font-bold">
            {([
              ["fani", "فني"],
              ["khabir", "خبير"],
            ] as const).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setLevel(k)}
                className={`flex-1 py-2.5 rounded-xl ${level === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {l}
              </button>
            ))}
          </div>

          <div className="mb-2 text-sm font-bold text-muted-foreground">عدد العمال المطلوب</div>
          <div className="flex items-center gap-3 mb-5 glass rounded-2xl p-3">
            <button onClick={() => setWorkersCount(Math.max(1, workersCount - 1))} className="h-10 w-10 rounded-xl bg-surface-2 font-black btn-press">−</button>
            <div className="flex-1 text-center font-black text-2xl">{workersCount}</div>
            <button onClick={() => setWorkersCount(Math.min(10, workersCount + 1))} className="h-10 w-10 rounded-xl bg-primary text-primary-foreground font-black btn-press">+</button>
          </div>
        </>
      )}

      <div className="space-y-3 mt-4">
        <Field label={type === "taxi" ? "موقع الانطلاق" : "موقع الخدمة"} icon><input value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="مثال: حي السلام، شارع 12" className="w-full bg-input border border-border rounded-2xl px-4 py-3.5 text-sm font-bold outline-none focus:border-ring" /></Field>
        {type === "taxi" && (
          <Field label="الوجهة"><input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="مثال: المنصور" className="w-full bg-input border border-border rounded-2xl px-4 py-3.5 text-sm font-bold outline-none focus:border-ring" /></Field>
        )}
        <Field label="ملاحظات (اختياري)">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="تفاصيل إضافية..." className="w-full bg-input border border-border rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-ring resize-none" />
        </Field>
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

function Field({ label, icon, children }: { label: string; icon?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-bold text-muted-foreground mb-2 flex items-center gap-1">
        {icon && <MapPin className="h-3.5 w-3.5" />} {label}
      </div>
      {children}
    </label>
  );
}
