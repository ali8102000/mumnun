import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/mobile-shell";
import {
  Car, Wrench, Power, Sun, Moon, Zap, ShieldCheck,
  Sparkles, ArrowUpLeft, Clock, MapPin, TrendingUp,
  Users, UserCheck, Send,
} from "lucide-react";
import { NotificationsBell } from "@/components/notifications-bell";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { acceptServiceRequest } from "@/lib/dispatch.functions";
import { useTheme } from "@/lib/use-theme";
import { playClick } from "@/lib/click-sound";

export const Route = createFileRoute("/home")({ ssr: false, component: HomePage });

function greetingByHour() {
  const h = new Date().getHours();
  if (h < 5) return "مساء الخير";
  if (h < 12) return "صباح الخير";
  if (h < 18) return "نهارك سعيد";
  return "مساء الخير";
}

function HomePage() {
  const { loading, session, profile, roles } = useAuth();
  const [activeRole, setActiveRole] = useState<AppRole | null>(null);
  const { theme, toggle } = useTheme();
  const greet = useMemo(greetingByHour, []);

  useEffect(() => {
    if (roles.length && !activeRole) setActiveRole(roles[0]);
  }, [roles, activeRole]);

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;
  if (!roles.length) return <Navigate to="/select-role" />;

  const firstName = (profile?.full_name || "صديقنا").split(" ")[0];
  const isWorker = activeRole === "worker" || activeRole === "driver";

  return (
    <MobileShell>
      <div className="relative px-5 pt-10 pb-6">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6 animate-pop-in">
          <div>
            <div className="text-[11px] font-bold tracking-wider text-primary/80 uppercase">{greet}</div>
            <div className="text-2xl font-black leading-tight mt-0.5 text-foreground">
              {firstName} <span className="inline-block animate-float">👋</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { playClick("toggle"); toggle(); }}
              aria-label="تبديل الوضع"
              className="glass-strong h-11 w-11 rounded-2xl grid place-items-center btn-press tap-highlight-none relative overflow-hidden"
            >
              <Sun className={`h-5 w-5 absolute transition-all duration-500 ${theme === "dark" ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"}`} />
              <Moon className={`h-5 w-5 absolute transition-all duration-500 ${theme === "dark" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"}`} />
            </button>
            <NotificationsBell />
          </div>
        </div>

        {/* Role switch */}
        {roles.length > 1 && (
          <div className="relative flex bg-surface-2 rounded-2xl p-1 mb-5 text-xs font-bold animate-pop-in">
            {roles.map((r) => {
              const active = activeRole === r;
              return (
                <button
                  key={r}
                  onClick={() => { playClick("soft"); setActiveRole(r); }}
                  className={`relative flex-1 py-2.5 rounded-xl btn-press tap-highlight-none transition-colors ${
                    active ? "text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {active && (
                    <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary to-primary-glow shadow-[0_6px_20px_-8px_var(--primary)]" />
                  )}
                  <span className="relative">
                    {r === "customer" ? "زبون" : r === "driver" ? "كابتن" : "فني"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Friends tab — only for workers/drivers, NOT customers */}
        {isWorker && (
          <Link
            to="/friends"
            onClick={() => playClick("pop")}
            className="glass rounded-2xl p-3 mb-4 flex items-center gap-3 btn-press tap-highlight-none animate-pop-in"
          >
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center text-primary-foreground shadow-md">
              <Users className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="font-bold text-sm text-foreground">الأصدقاء والتعاون</div>
              <div className="text-[11px] text-muted-foreground">ابحث واضيف أصدقاء للعمل المشترك</div>
            </div>
            <ArrowUpLeft className="h-4 w-4 text-muted-foreground" />
          </Link>
        )}

        {activeRole === "customer" && <CustomerHome />}
        {activeRole === "driver" && <ProviderHome type="taxi" />}
        {activeRole === "worker" && <ProviderHome type="service" />}
      </div>
    </MobileShell>
  );
}

/* ---------------- Customer ---------------- */

function CustomerHome() {
  return (
    <div className="space-y-4">
      <div className="relative rounded-3xl p-6 overflow-hidden animate-pop-in shadow-elegant bg-gradient-to-br from-primary via-primary-glow to-accent text-primary-foreground">
        <div className="absolute inset-0 shine opacity-30 mix-blend-overlay" />
        <div className="absolute -top-8 -left-8 h-40 w-40 rounded-full bg-white/20 blur-2xl" />
        <div className="absolute -bottom-12 -right-4 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur px-2.5 py-1 text-[10px] font-bold">
            <Sparkles className="h-3 w-3" /> مجاناً بلا عمولة
          </div>
          <div className="text-2xl font-black mt-3 leading-tight">اطلب الآن<br/>ادفع للمزوّد مباشرة</div>
          <div className="text-xs opacity-90 mt-2">ممنون منصّة مجانية — بدون أي نسبة على طلبك</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <QuickTile to="/request/new" type="taxi" title="طلب سيارة" subtitle="خلال دقائق"
          icon={<Car className="h-7 w-7" />} gradient="from-amber-500 to-orange-500" span={2} delay={0.05} />
        <QuickTile to="/request/new" type="service" title="طلب فني" subtitle="١٦ خدمة"
          icon={<Wrench className="h-6 w-6" />} gradient="from-emerald-500 to-teal-400" delay={0.1} />
      </div>

      <div className="grid grid-cols-3 gap-2.5 animate-pop-in" style={{ animationDelay: "0.15s" }}>
        <MiniStat icon={<Clock className="h-4 w-4" />} label="وصول خلال" value="٣ د" accent="text-amber-500" />
        <MiniStat icon={<MapPin className="h-4 w-4" />} label="تغطية" value="كل العراق" accent="text-sky-500" />
        <MiniStat icon={<ShieldCheck className="h-4 w-4" />} label="مزودون" value="موثق" accent="text-emerald-500" />
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-black text-lg text-foreground">لماذا ممنون؟</h3>
          <span className="text-[11px] text-muted-foreground">مميّزاتنا</span>
        </div>
        <div className="space-y-2.5">
          <FeatureRow icon={<Zap className="h-5 w-5" />} title="سرعة في الاستجابة" desc="نوصلك بأقرب مزوّد خدمة" accent="from-amber-500 to-orange-500" />
          <FeatureRow icon={<ShieldCheck className="h-5 w-5" />} title="أمان مضمون" desc="جميع المزوّدين موثّقون" accent="from-emerald-500 to-teal-400" />
          <FeatureRow icon={<TrendingUp className="h-5 w-5" />} title="بدون عمولة" desc="تدفع للمزوّد مباشرة بدون وسطاء" accent="from-sky-500 to-cyan-400" />
        </div>
      </div>
    </div>
  );
}

function QuickTile({
  to, type, title, subtitle, icon, gradient, span = 1, delay = 0,
}: {
  to: string; type: "taxi" | "service"; title: string; subtitle: string;
  icon: React.ReactNode; gradient: string; span?: 1 | 2; delay?: number;
}) {
  return (
    <Link
      to={to as any}
      search={{ type } as any}
      onClick={() => playClick("pop")}
      className={`glass rounded-3xl p-4 btn-press shadow-card tap-highlight-none animate-pop-in relative overflow-hidden group ${
        span === 2 ? "col-span-2 min-h-[132px]" : "min-h-[132px]"
      }`}
      style={{ animationDelay: `${delay}s` }}
    >
      <div className={`absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-gradient-to-br ${gradient} opacity-20 blur-2xl group-hover:opacity-40 transition-opacity`} />
      <div className="relative flex flex-col h-full justify-between">
        <div className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${gradient} grid place-items-center text-white shadow-lg`}>
          {icon}
        </div>
        <div>
          <div className="flex items-center gap-1">
            <div className="font-black text-base text-foreground">{title}</div>
            <ArrowUpLeft className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>
        </div>
      </div>
    </Link>
  );
}

function MiniStat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className="glass rounded-2xl p-3 flex flex-col items-center text-center gap-0.5">
      <div className={accent}>{icon}</div>
      <div className="font-black text-sm text-foreground">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function FeatureRow({
  icon, title, desc, accent,
}: { icon: React.ReactNode; title: string; desc: string; accent: string }) {
  return (
    <div className="glass rounded-2xl p-3.5 flex items-center gap-3 btn-press">
      <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${accent} grid place-items-center text-white shadow-md shrink-0`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm text-foreground">{title}</div>
        <div className="text-[11px] text-muted-foreground">{desc}</div>
      </div>
    </div>
  );
}

/* ---------------- Provider ---------------- */

function ProviderHome({ type }: { type: "taxi" | "service" }) {
  const { session } = useAuth();
  const acceptFn = useServerFn(acceptServiceRequest);
  const [available, setAvailable] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const [stats, setStats] = useState({ jobs: 0 });
  const [friends, setFriends] = useState<{friend_id: string, profiles: {full_name: string} | null}[]>([]);
  const [transferModal, setTransferModal] = useState<string | null>(null);
  const table = type === "taxi" ? "driver_profiles" : "worker_profiles";

  useEffect(() => {
    if (!session) return;
    supabase.from(table).select("*").eq("user_id", session.user.id).maybeSingle().then(({ data }) => {
      if (data) {
        setAvailable(data.available);
        const d: any = data;
        setStats({ jobs: d.completed_jobs ?? d.completed_rides ?? 0 });
      }
    });

    async function loadRequests() {
      const { data } = await supabase.from("service_requests")
        .select("id, pickup_text, dest_text, notes, created_at, service_id, type")
        .eq("status", "pending").eq("type", type)
        .order("created_at", { ascending: false }).limit(20);
      setRequests(data ?? []);
    }
    loadRequests();

    // Load friends for transfer feature (workers only)
    if (type === "service") {
      supabase.from("friends")
        .select("friend_id, profiles:friend_id(full_name)")
        .eq("user_id", session.user.id)
        .then(({ data }) => setFriends((data ?? []) as any));
    }

    const channel = supabase.channel("provider-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_requests" }, () => loadRequests())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, type, table]);

  async function toggleAvail() {
    playClick("toggle");
    const next = !available;
    setAvailable(next);
    await supabase.from(table).update({ available: next }).eq("user_id", session!.user.id);
  }

  async function accept(id: string) {
    playClick("pop");
    try {
      await acceptFn({ data: { requestId: id } });
      toast.success("تم قبول الطلب");
      window.location.href = `/request/${id}`;
    } catch (e: any) {
      toast.error(e.message ?? "تعذّر قبول الطلب");
    }
  }

  async function transferToFriend(requestId: string, friendId: string) {
    try {
      const { error } = await supabase.from("service_requests")
        .update({ transferred_to: friendId })
        .eq("id", requestId);
      if (error) throw error;
      toast.success("تم تحويل الطلب لصديقك");
      setTransferModal(null);
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    }
  }

  return (
    <div className="space-y-4">
      <div className={`relative rounded-3xl p-5 overflow-hidden animate-pop-in shadow-card ${
        available
          ? "bg-gradient-to-br from-emerald-500 to-teal-400 text-white"
          : "glass"
      }`}>
        {available && <div className="absolute inset-0 shine opacity-30 mix-blend-overlay" />}
        <div className="relative flex items-center justify-between">
          <div>
            <div className={`text-xs ${available ? "text-white/80" : "text-muted-foreground"}`}>حالة التوفر</div>
            <div className="font-black text-lg mt-0.5">{available ? "متاح للعمل" : "غير متاح"}</div>
          </div>
          <button
            onClick={toggleAvail}
            className={`h-14 w-14 rounded-2xl grid place-items-center btn-press transition ${
              available ? "bg-white/25 backdrop-blur" : "bg-surface-2"
            }`}
          >
            <Power className={`h-6 w-6 ${available ? "text-white" : "text-muted-foreground"}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 animate-pop-in" style={{ animationDelay: "0.05s" }}>
        <div className="glass rounded-2xl p-4">
          <div className="text-xs text-muted-foreground">الطلبات المكتملة</div>
          <div className="font-black text-2xl mt-1 text-foreground">{stats.jobs}</div>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="text-xs text-muted-foreground">الطلبات المتاحة</div>
          <div className="font-black text-2xl mt-1 text-foreground">{available ? requests.length : "—"}</div>
        </div>
      </div>

      <div>
        <h3 className="font-black mb-3 mt-2 text-foreground">الطلبات المتاحة</h3>
        {!available && (
          <div className="glass rounded-2xl p-4 text-center text-sm text-muted-foreground">
            فعّل التوفر لعرض الطلبات
          </div>
        )}
        {available && requests.length === 0 && (
          <div className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">
            لا توجد طلبات جديدة الآن
          </div>
        )}
        {available && requests.map((r, i) => (
          <div key={r.id} className="glass rounded-2xl p-4 mb-2.5 animate-pop-in" style={{ animationDelay: `${i * 0.04}s` }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate text-foreground">📍 {r.pickup_text || "بدون عنوان"}</div>
                {r.dest_text && <div className="text-xs text-muted-foreground mt-1 truncate">🎯 {r.dest_text}</div>}
                {r.notes && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">📝 {r.notes}</div>}
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <button
                  onClick={() => accept(r.id)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground font-bold text-xs btn-press shadow-md"
                >
                  قبول
                </button>
                {/* Transfer to friend — workers only */}
                {type === "service" && friends.length > 0 && (
                  <button
                    onClick={() => setTransferModal(r.id)}
                    className="px-4 py-2 rounded-xl bg-surface-2 text-foreground font-bold text-xs btn-press flex items-center gap-1"
                  >
                    <Send className="h-3 w-3" />
                    تحويل
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Transfer modal */}
      {transferModal && (
        <div className="fixed inset-0 z-50 grid place-items-center p-5 bg-black/40 backdrop-blur-sm" onClick={() => setTransferModal(null)}>
          <div className="glass-strong rounded-3xl p-5 w-full max-w-sm animate-pop-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-black text-lg mb-3 text-foreground">حوّل الطلب لصديق</h3>
            <p className="text-xs text-muted-foreground mb-4">اختر صديق لتحويل الطلب إليه للعمل المشترك</p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {friends.map((f) => (
                <button
                  key={f.friend_id}
                  onClick={() => transferToFriend(transferModal, f.friend_id)}
                  className="w-full flex items-center gap-3 bg-surface-2 rounded-xl p-3 btn-press text-right"
                >
                  <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary/30 to-primary-glow/30 grid place-items-center font-black text-primary text-sm">
                    {(f.profiles?.full_name || "?").charAt(0)}
                  </div>
                  <div className="flex-1 text-sm font-bold text-foreground">{f.profiles?.full_name || "مستخدم"}</div>
                  <Send className="h-4 w-4 text-primary" />
                </button>
              ))}
            </div>
            <button
              onClick={() => setTransferModal(null)}
              className="w-full mt-3 py-2.5 rounded-xl bg-surface-2 text-muted-foreground font-bold text-sm btn-press"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
