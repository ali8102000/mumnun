import { createFileRoute, Navigate, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { MobileShell } from "@/components/mobile-shell";
import { LogOut, Star, Settings, Wallet, TrendingUp, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NotificationsBell } from "@/components/notifications-bell";

export const Route = createFileRoute("/profile")({ ssr: false, component: ProfilePage });

function ProfilePage() {
  const { session, profile, roles, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [wallet, setWallet] = useState<any>(null);
  const [txs, setTxs] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const uid = session?.user.id;
  const isDriver = roles.includes("driver");

  useEffect(() => {
    if (!uid) return;
    if (isDriver) {
      (supabase as any).from("driver_wallets").select("*").eq("user_id", uid).maybeSingle().then(({ data }: any) => setWallet(data));
      (supabase as any).from("transactions").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(10).then(({ data }: any) => setTxs(data ?? []));
    }
    (supabase as any).rpc("has_role", { _user_id: uid, _role: "admin" }).then(({ data }: any) => setIsAdmin(!!data));
  }, [uid, isDriver]);

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;

  return (
    <MobileShell>
      <div className="px-5 pt-10">
        <div className="flex justify-end mb-3">
          <NotificationsBell />
        </div>
        <div className="glass rounded-3xl p-6 text-center shadow-card">
          <div className="h-20 w-20 mx-auto rounded-3xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center text-primary-foreground text-3xl font-black glow-primary mb-3">
            {(profile?.full_name || "؟").charAt(0)}
          </div>
          <div className="text-xl font-black">{profile?.full_name}</div>
          <div className="text-xs text-muted-foreground mt-1" dir="ltr">{profile?.phone}</div>
          <div className="flex justify-center gap-1.5 mt-3 flex-wrap">
            {roles.map((r) => (
              <span key={r} className="text-[10px] font-black px-3 py-1 rounded-full bg-primary/20 text-primary">
                {r === "customer" ? "زبون" : r === "driver" ? "كابتن" : r === "admin" ? "مدير" : "فني"}
              </span>
            ))}
          </div>
        </div>

        {isDriver && (
          <div className="mt-5 rounded-3xl p-5 bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-elegant glow-primary">
            <div className="flex items-center gap-2 mb-3 opacity-90">
              <Wallet className="h-4 w-4" />
              <span className="text-xs font-bold">محفظتي</span>
            </div>
            <div className="text-3xl font-black">{Number(wallet?.balance ?? 0).toLocaleString()} <span className="text-base font-bold opacity-80">د.ع</span></div>
            <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
              <div className="bg-white/15 rounded-2xl p-2.5">
                <div className="opacity-80">إجمالي الأرباح</div>
                <div className="font-black mt-0.5">{Number(wallet?.total_earned ?? 0).toLocaleString()}</div>
              </div>
              <div className="bg-white/15 rounded-2xl p-2.5">
                <div className="opacity-80">إجمالي العمولة</div>
                <div className="font-black mt-0.5">{Number(wallet?.total_commission ?? 0).toLocaleString()}</div>
              </div>
            </div>
          </div>
        )}

        {isDriver && txs.length > 0 && (
          <div className="mt-5">
            <div className="text-xs font-bold text-muted-foreground mb-2 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> آخر الحركات
            </div>
            <ul className="space-y-1.5">
              {txs.map((t) => (
                <li key={t.id} className="glass rounded-2xl p-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold">{t.note ?? t.type}</div>
                    <div className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleString("ar-IQ")}</div>
                  </div>
                  <div className={`text-sm font-black ${Number(t.amount) >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                    {Number(t.amount) >= 0 ? "+" : ""}{Number(t.amount).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 space-y-2">
          {isAdmin && (
            <Link to="/admin" className="w-full glass rounded-2xl p-4 flex items-center gap-3 btn-press text-right">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <span className="flex-1 font-bold text-sm">لوحة الإدارة</span>
            </Link>
          )}
          <button onClick={() => navigate({ to: "/select-role" })} className="w-full glass rounded-2xl p-4 flex items-center gap-3 btn-press text-right">
            <Settings className="h-5 w-5 text-primary" />
            <span className="flex-1 font-bold text-sm">إضافة دور آخر</span>
          </button>
          <button onClick={async () => { await signOut(); navigate({ to: "/auth" }); }} className="w-full glass rounded-2xl p-4 flex items-center gap-3 btn-press text-right text-destructive">
            <LogOut className="h-5 w-5" />
            <span className="flex-1 font-bold text-sm">تسجيل الخروج</span>
          </button>
        </div>

        <div className="mt-6 text-center text-[11px] text-muted-foreground">
          ممنون · v2.0
        </div>
      </div>
    </MobileShell>
  );
}
