import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldCheck, Users, Car, ListChecks, Wallet, DollarSign } from "lucide-react";

export const Route = createFileRoute("/admin")({ ssr: false, component: AdminPage });

function AdminPage() {
  const { session, loading } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [pricing, setPricing] = useState<any[]>([]);

  useEffect(() => {
    if (!session) return;
    (supabase as any)
      .rpc("has_role", { _user_id: session.user.id, _role: "admin" })
      .then(async ({ data }: any) => {
        if (!data) { setAuthorized(false); return; }
        setAuthorized(true);
        const [reqAll, reqActive, reqDone, users, drivers, prices] = await Promise.all([
          supabase.from("service_requests").select("id", { count: "exact", head: true }),
          supabase.from("service_requests").select("id", { count: "exact", head: true }).in("status", ["pending","searching","accepted","in_progress"] as any),
          supabase.from("service_requests").select("id", { count: "exact", head: true }).eq("status", "completed" as any),
          supabase.from("profiles").select("id", { count: "exact", head: true }),
          (supabase as any).from("driver_profiles").select("user_id", { count: "exact", head: true }),
          (supabase as any).from("pricing_rules").select("*").order("vehicle_category"),
        ]);
        setStats({
          requests: reqAll.count ?? 0,
          active: reqActive.count ?? 0,
          completed: reqDone.count ?? 0,
          users: users.count ?? 0,
          drivers: drivers.count ?? 0,
        });
        setPricing(prices.data ?? []);
        const { data: rec } = await supabase.from("service_requests").select("id, type, status, price_estimate, created_at").order("created_at", { ascending: false }).limit(20);
        setRecent(rec ?? []);
      });
  }, [session]);

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;
  if (authorized === null) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!authorized) return (
    <div className="min-h-screen grid place-items-center px-5">
      <div className="text-center">
        <ShieldCheck className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
        <div className="font-black">غير مصرّح</div>
        <div className="text-xs text-muted-foreground">هذه الصفحة للمديرين فقط</div>
        <Link to="/" className="inline-block mt-4 text-primary text-sm font-bold">العودة للرئيسية</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen px-5 pt-10 pb-20">
      <div className="flex items-center gap-2 mb-6">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-black">لوحة الإدارة</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <Stat icon={ListChecks} label="إجمالي الطلبات" value={stats?.requests} />
        <Stat icon={Car} label="نشطة الآن" value={stats?.active} accent="text-amber-500" />
        <Stat icon={DollarSign} label="مكتملة" value={stats?.completed} accent="text-emerald-600" />
        <Stat icon={Users} label="المستخدمون" value={stats?.users} />
      </div>

      <h2 className="font-black mb-2 flex items-center gap-2"><Wallet className="h-4 w-4" /> قواعد التسعير</h2>
      <div className="space-y-2 mb-6">
        {pricing.map((p) => (
          <div key={p.id} className="glass rounded-2xl p-3 flex items-center justify-between text-sm">
            <div className="font-black">{p.vehicle_category}</div>
            <div className="text-xs text-muted-foreground">
              أساس {p.base_fare} · /كم {p.per_km} · /د {p.per_min} · حد {p.minimum_fare} · عمولة {p.commission_pct}%
            </div>
          </div>
        ))}
      </div>

      <h2 className="font-black mb-2 flex items-center gap-2"><ListChecks className="h-4 w-4" /> أحدث الطلبات</h2>
      <ul className="space-y-2">
        {recent.map((r) => (
          <li key={r.id} className="glass rounded-2xl p-3 flex items-center justify-between text-sm">
            <div>
              <div className="font-bold">{r.type === "taxi" ? "🚕 سيارة" : "🛠️ خدمة"}</div>
              <div className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleString("ar-IQ")}</div>
            </div>
            <div className="text-left">
              <div className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary inline-block">{r.status === "pending" ? "بانتظار" : r.status === "searching" ? "بحث" : r.status === "accepted" ? "مقبول" : r.status === "in_progress" ? "قيد التنفيذ" : r.status === "completed" ? "مكتمل" : r.status === "cancelled" ? "ملغي" : r.status}</div>
              {r.price_estimate && <div className="text-xs font-black mt-0.5">{Number(r.price_estimate).toLocaleString()} د.ع</div>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ icon: Icon, label, value, accent }: any) {
  return (
    <div className="glass rounded-2xl p-4">
      <Icon className={`h-5 w-5 mb-2 ${accent ?? "text-primary"}`} />
      <div className="text-2xl font-black">{value ?? "—"}</div>
      <div className="text-[10px] text-muted-foreground font-bold mt-0.5">{label}</div>
    </div>
  );
}
