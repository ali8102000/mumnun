import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Award, Star } from "lucide-react";

export const Route = createFileRoute("/onboarding/worker")({
  ssr: false,
  component: OnboardingWorker,
});

interface Service { id: string; name_ar: string; slug: string }

function OnboardingWorker() {
  const { session, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState<Service[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [level, setLevel] = useState<"fani" | "khabir">("fani");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("services").select("id, name_ar, slug").order("sort_order")
      .then(({ data }) => setServices(data ?? []));
  }, []);

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function submit() {
    if (selected.size === 0) {
      toast.error("اختر اختصاص واحد على الأقل");
      return;
    }
    setBusy(true);
    try {
      const uid = session!.user.id;
      const { error: pErr } = await supabase.from("worker_profiles").upsert({
        user_id: uid, level, bio, available: true,
      }, { onConflict: "user_id" });
      if (pErr) throw pErr;
      await supabase.from("worker_services").delete().eq("worker_id", uid);
      const rows = Array.from(selected).map((service_id) => ({ worker_id: uid, service_id }));
      const { error: sErr } = await supabase.from("worker_services").insert(rows);
      if (sErr) throw sErr;

      const { error: roleErr } = await supabase.from("user_roles").insert({
        user_id: uid, role: "worker",
      });
      if (roleErr && !roleErr.message.toLowerCase().includes("duplicate")) throw roleErr;

      await refresh();
      toast.success("تم تفعيل ملفك");
      navigate({ to: "/home" });
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen px-5 pt-10 pb-32">
      <h1 className="text-3xl font-black">ملف الفني</h1>
      <p className="text-sm text-muted-foreground mt-2 mb-6">اختر مستواك واختصاصاتك</p>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <LevelCard active={level === "fani"} onClick={() => setLevel("fani")} icon={<Star className="h-6 w-6" />} title="فني" desc="خبرة في تخصصك" />
        <LevelCard active={level === "khabir"} onClick={() => setLevel("khabir")} icon={<Award className="h-6 w-6" />} title="خبير" desc="أولوية في الطلبات" />
      </div>

      <div className="glass rounded-3xl p-5 mb-6">
        <div className="text-xs font-bold text-muted-foreground mb-2">نبذة عنك (اختياري)</div>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          placeholder="مثال: ٥ سنوات خبرة بتصليح الأجهزة الكهربائية..."
          className="w-full bg-input border border-border rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-ring resize-none"
        />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-black">الاختصاصات</h2>
        <span className="text-xs text-muted-foreground">{selected.size} مختار</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {services.map((s) => {
          const on = selected.has(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              className={`glass rounded-2xl p-4 text-sm font-bold btn-press tap-highlight-none text-right transition ${
                on ? "ring-2 ring-primary text-primary glow-primary" : ""
              }`}
            >
              {s.name_ar}
            </button>
          );
        })}
      </div>

      <div className="fixed bottom-0 inset-x-0 p-4 glass-strong border-t border-border">
        <button
          disabled={busy}
          onClick={submit}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-bold btn-press glow-primary disabled:opacity-50 flex items-center justify-center gap-2 max-w-md mx-auto"
        >
          {busy && <Loader2 className="h-5 w-5 animate-spin" />}
          حفظ والمتابعة
          <ArrowLeft className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function LevelCard({ active, onClick, icon, title, desc }: any) {
  return (
    <button
      onClick={onClick}
      className={`glass rounded-2xl p-4 flex flex-col items-start gap-2 btn-press tap-highlight-none transition ${
        active ? "ring-2 ring-primary glow-primary" : ""
      }`}
    >
      <div className={`h-10 w-10 rounded-xl grid place-items-center ${active ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground"}`}>
        {icon}
      </div>
      <div className="text-right">
        <div className="font-black">{title}</div>
        <div className="text-[11px] text-muted-foreground">{desc}</div>
      </div>
    </button>
  );
}
