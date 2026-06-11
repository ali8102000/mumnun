import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { MobileShell } from "@/components/mobile-shell";
import { LogOut, Star, Settings } from "lucide-react";

export const Route = createFileRoute("/profile")({ ssr: false, component: ProfilePage });

function ProfilePage() {
  const { session, profile, roles, loading, signOut } = useAuth();
  const navigate = useNavigate();
  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;

  return (
    <MobileShell>
      <div className="px-5 pt-10">
        <div className="glass rounded-3xl p-6 text-center shadow-card">
          <div className="h-20 w-20 mx-auto rounded-3xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center text-primary-foreground text-3xl font-black glow-primary mb-3">
            {(profile?.full_name || "؟").charAt(0)}
          </div>
          <div className="text-xl font-black">{profile?.full_name}</div>
          <div className="text-xs text-muted-foreground mt-1" dir="ltr">{profile?.phone}</div>
          <div className="flex justify-center gap-1.5 mt-3 flex-wrap">
            {roles.map((r) => (
              <span key={r} className="text-[10px] font-black px-3 py-1 rounded-full bg-primary/20 text-primary">
                {r === "customer" ? "زبون" : r === "driver" ? "كابتن" : "فني"}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-5 space-y-2">
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
          ممنون · v1.0
        </div>
      </div>
    </MobileShell>
  );
}
