import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Car, Wrench, User, Loader2, ArrowLeft, Check, Sparkles, ShieldCheck, Zap } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/select-role")({
  ssr: false, component: SelectRolePage });

const roles: { id: AppRole; title: string; desc: string; icon: any; gradient: string; bg: string; perks: string[] }[] = [
  {
    id: "customer", title: "زبون", desc: "اطلب تكسي أو خدمة منزلية بضغطة واحدة",
    icon: User, gradient: "from-blue-500 to-cyan-400", bg: "from-sky-50 to-blue-50",
    perks: ["طلب سريع", "بدون عمولة", "تتبع مباشر"],
  },
  {
    id: "driver", title: "كابتن تكسي", desc: "استقبل طلبات الرحلات واكسب يومياً",
    icon: Car, gradient: "from-amber-500 to-orange-500", bg: "from-amber-50 to-orange-50",
    perks: ["أرباح يومية", "ساعات مرنة", "طلب مستمر"],
  },
  {
    id: "worker", title: "فني خدمات", desc: "قدم خدمتك واستقبل طلبات في اختصاصك",
    icon: Wrench, gradient: "from-emerald-500 to-teal-500", bg: "from-emerald-50 to-teal-50",
    perks: ["١٦ تخصص", "أولوية للخبراء", "دخل إضافي"],
  },
];

function SelectRolePage() {
  const { session, refresh, loading } = useAuth();
  const [picked, setPicked] = useState<AppRole | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;

  async function confirm() {
    if (!picked || !session) return;
    setBusy(true);
    try {
      if (picked === "customer") {
        const { error } = await supabase.from("user_roles").insert({ user_id: session.user.id, role: "customer" });
        if (error && !error.message.toLowerCase().includes("duplicate")) throw error;
        await refresh();
        navigate({ to: "/home" });
      } else if (picked === "driver") {
        navigate({ to: "/onboarding/driver" });
      } else {
        navigate({ to: "/onboarding/worker" });
      }
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col px-5 pt-12 pb-8">
      {/* Hero header */}
      <div className="mb-8 animate-pop-in">
        <div className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-1 text-[10px] font-bold text-primary mb-4">
          <Sparkles className="h-3 w-3" /> مرحباً بك في ممنون
        </div>
        <h1 className="text-4xl font-black leading-tight">اختر نوع حسابك</h1>
        <p className="text-sm text-muted-foreground mt-2">يمكنك إضافة أدوار أخرى لاحقاً من الإعدادات</p>
      </div>

      {/* Role cards */}
      <div className="space-y-4 flex-1">
        {roles.map(({ id, title, desc, icon: Icon, gradient, perks }, i) => {
          const active = picked === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setPicked(id)}
              className={`w-full text-right rounded-3xl p-5 btn-press tap-highlight-none transition-all animate-pop-in relative overflow-hidden ${
                active
                  ? "bg-white ring-2 ring-primary shadow-elegant glow-primary scale-[1.02]"
                  : "glass hover:bg-white/80"
              }`}
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              {active && (
                <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-5`} />
              )}
              <div className="relative flex items-center gap-4">
                <div className={`h-16 w-16 rounded-3xl bg-gradient-to-br ${gradient} grid place-items-center shadow-lg shrink-0 transition-transform ${active ? "scale-110" : ""}`}>
                  <Icon className="h-8 w-8 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xl font-black">{title}</div>
                  <div className="text-xs text-muted-foreground mt-1">{desc}</div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {perks.map((p) => (
                      <span key={p} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                        <Check className="h-2.5 w-2.5 text-primary" /> {p}
                      </span>
                    ))}
                  </div>
                </div>
                <div className={`h-7 w-7 rounded-full border-2 grid place-items-center shrink-0 transition-all ${active ? "border-primary bg-primary scale-110" : "border-border"}`}>
                  {active && <Check className="h-4 w-4 text-primary-foreground" />}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Trust badges */}
      <div className="flex items-center justify-center gap-4 mt-6 mb-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> آمن</span>
        <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5 text-amber-500" /> سريع</span>
        <span className="flex items-center gap-1"><Sparkles className="h-3.5 w-3.5 text-primary" /> مجاني</span>
      </div>

      <button
        disabled={!picked || busy}
        onClick={confirm}
        className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-bold text-base btn-press glow-primary shadow-elegant disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy && <Loader2 className="h-5 w-5 animate-spin" />}
        متابعة
        <ArrowLeft className="h-5 w-5" />
      </button>
    </div>
  );
}
