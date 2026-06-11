import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/mobile-shell";
import { Car, Wrench, Power, Bell, Star } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/home")({ ssr: false, component: HomePage });

function HomePage() {
  const { loading, session, profile, roles } = useAuth();
  const [activeRole, setActiveRole] = useState<AppRole | null>(null);

  useEffect(() => {
    if (roles.length && !activeRole) setActiveRole(roles[0]);
  }, [roles, activeRole]);

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;
  if (!roles.length) return <Navigate to="/select-role" />;

  return (
    <MobileShell>
      <div className="px-5 pt-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-xs text-muted-foreground">مرحباً</div>
            <div className="text-xl font-black">{profile?.full_name || "صديقنا"} 👋</div>
          </div>
          <button className="glass h-11 w-11 rounded-2xl grid place-items-center btn-press">
            <Bell className="h-5 w-5" />
          </button>
        </div>

        {roles.length > 1 && (
          <div className="flex bg-surface-2 rounded-2xl p-1 mb-5 text-xs font-bold">
            {roles.map((r) => (
              <button
                key={r}
                onClick={() => setActiveRole(r)}
                className={`flex-1 py-2.5 rounded-xl btn-press tap-highlight-none ${
                  activeRole === r ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {r === "customer" ? "زبون" : r === "driver" ? "كابتن" : "فني"}
              </button>
            ))}
          </div>
        )}

        {activeRole === "customer" && <CustomerHome />}
        {activeRole === "driver" && <ProviderHome type="taxi" />}
        {activeRole === "worker" && <ProviderHome type="service" />}
      </div>
    </MobileShell>
  );
}

function CustomerHome() {
  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6 shadow-card relative overflow-hidden">
        <div className="absolute -top-10 -left-10 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative">
          <div className="text-xs text-primary font-bold mb-1">عرض الترحيب</div>
          <div className="text-lg font-black">رحلتك الأولى بخصم ٥٠٪</div>
          <div className="text-xs text-muted-foreground mt-1">صالح للأسبوع الأول فقط</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link
          to="/request/new"
          search={{ type: "taxi" }}
          className="glass rounded-3xl p-5 btn-press shadow-card flex flex-col gap-3 items-start tap-highlight-none"
        >
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-500 to-yellow-400 grid place-items-center">
            <Car className="h-7 w-7 text-white" />
          </div>
          <div>
            <div className="font-black text-base">طلب سيارة</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">تكسي خلال دقائق</div>
          </div>
        </Link>

        <Link
          to="/request/new"
          search={{ type: "service" }}
          className="glass rounded-3xl p-5 btn-press shadow-card flex flex-col gap-3 items-start tap-highlight-none"
        >
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-400 grid place-items-center">
            <Wrench className="h-7 w-7 text-white" />
          </div>
          <div>
            <div className="font-black text-base">طلب فني</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">١٦ خدمة منزلية</div>
          </div>
        </Link>
      </div>

      <div className="mt-6">
        <h3 className="font-black mb-3">لماذا ممنون؟</h3>
        <div className="space-y-2">
          {[
            { icon: "⚡", t: "سرعة في الاستجابة", d: "نوصلك بأقرب مزود خدمة" },
            { icon: "🛡️", t: "أمان مضمون", d: "جميع المزودين موثقين" },
            { icon: "⭐", t: "تقييمات حقيقية", d: "اختر الأفضل بنفسك" },
          ].map((f) => (
            <div key={f.t} className="glass rounded-2xl p-4 flex items-center gap-3">
              <div className="text-2xl">{f.icon}</div>
              <div>
                <div className="font-bold text-sm">{f.t}</div>
                <div className="text-[11px] text-muted-foreground">{f.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProviderHome({ type }: { type: "taxi" | "service" }) {
  const { session } = useAuth();
  const [available, setAvailable] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const [stats, setStats] = useState({ rating: 5.0, jobs: 0 });
  const table = type === "taxi" ? "driver_profiles" : "worker_profiles";

  useEffect(() => {
    if (!session) return;
    supabase.from(table).select("*").eq("user_id", session.user.id).maybeSingle().then(({ data }) => {
      if (data) {
        setAvailable(data.available);
        const d: any = data;
        setStats({ rating: Number(d.rating_avg ?? 5), jobs: d.completed_jobs ?? d.completed_rides ?? 0 });
      }
    });

    async function loadRequests() {
      let q = supabase.from("service_requests")
        .select("id, pickup_text, dest_text, notes, created_at, service_id, type")
        .eq("status", "pending").eq("type", type)
        .order("created_at", { ascending: false }).limit(20);
      const { data } = await q;
      setRequests(data ?? []);
    }
    loadRequests();

    const channel = supabase.channel("provider-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_requests" }, () => loadRequests())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, type, table]);

  async function toggleAvail() {
    const next = !available;
    setAvailable(next);
    await supabase.from(table).update({ available: next }).eq("user_id", session!.user.id);
  }

  async function accept(id: string) {
    const { error } = await supabase.from("service_requests")
      .update({ provider_id: session!.user.id, status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", id).eq("status", "pending");
    if (error) { toast.error(error.message); return; }
    // create chat
    const { data: req } = await supabase.from("service_requests").select("customer_id").eq("id", id).single();
    if (req) {
      await supabase.from("chats").insert({ request_id: id, customer_id: req.customer_id, provider_id: session!.user.id });
    }
    toast.success("تم قبول الطلب");
    window.location.href = `/request/${id}`;
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-5 flex items-center justify-between shadow-card">
        <div>
          <div className="text-xs text-muted-foreground">حالة التوفر</div>
          <div className="font-black text-lg mt-0.5">{available ? "متاح للعمل" : "غير متاح"}</div>
        </div>
        <button
          onClick={toggleAvail}
          className={`h-14 w-14 rounded-2xl grid place-items-center btn-press transition ${
            available ? "bg-gradient-to-br from-emerald-500 to-teal-400 glow-primary" : "bg-surface-2"
          }`}
        >
          <Power className={`h-6 w-6 ${available ? "text-white" : "text-muted-foreground"}`} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="glass rounded-2xl p-4">
          <div className="text-xs text-muted-foreground">التقييم</div>
          <div className="flex items-center gap-1 mt-1">
            <Star className="h-5 w-5 text-primary fill-primary" />
            <span className="font-black text-lg">{stats.rating.toFixed(1)}</span>
          </div>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="text-xs text-muted-foreground">الطلبات المكتملة</div>
          <div className="font-black text-lg mt-1">{stats.jobs}</div>
        </div>
      </div>

      <div>
        <h3 className="font-black mb-3 mt-2">الطلبات المتاحة</h3>
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
        {available && requests.map((r) => (
          <div key={r.id} className="glass rounded-2xl p-4 mb-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">📍 {r.pickup_text || "بدون عنوان"}</div>
                {r.dest_text && <div className="text-xs text-muted-foreground mt-1 truncate">🎯 {r.dest_text}</div>}
                {r.notes && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">📝 {r.notes}</div>}
              </div>
              <button
                onClick={() => accept(r.id)}
                className="shrink-0 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs btn-press"
              >
                قبول
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
