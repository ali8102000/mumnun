import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/mobile-shell";
import { Car, Wrench } from "lucide-react";

export const Route = createFileRoute("/history")({ ssr: false, component: HistoryPage });

function HistoryPage() {
  const { session, loading } = useAuth();
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    if (!session) return;
    supabase.from("service_requests")
      .select("id, type, status, pickup_text, dest_text, created_at")
      .or(`customer_id.eq.${session.user.id},provider_id.eq.${session.user.id}`)
      .order("created_at", { ascending: false })
      .then(({ data }) => setItems(data ?? []));
  }, [session]);

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;

  return (
    <MobileShell>
      <div className="px-5 pt-10">
        <h1 className="text-3xl font-black mb-6">طلباتي</h1>
        {items.length === 0 && <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">لا يوجد طلبات بعد</div>}
        <div className="space-y-2.5">
          {items.map((r) => (
            <Link key={r.id} to="/request/$id" params={{ id: r.id }} className="glass rounded-2xl p-4 flex items-center gap-3 btn-press">
              <div className={`h-12 w-12 rounded-2xl grid place-items-center ${r.type === "taxi" ? "bg-gradient-to-br from-amber-500 to-yellow-400" : "bg-gradient-to-br from-emerald-500 to-teal-400"}`}>
                {r.type === "taxi" ? <Car className="h-6 w-6 text-white" /> : <Wrench className="h-6 w-6 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">{r.pickup_text || "بدون عنوان"}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{new Date(r.created_at).toLocaleString("ar")}</div>
              </div>
              <span className={`text-[10px] font-black px-2 py-1 rounded-full ${
                r.status === "completed" ? "bg-success/20 text-success" :
                r.status === "pending" ? "bg-primary/20 text-primary" :
                "bg-surface-2 text-muted-foreground"
              }`}>
                {r.status === "pending" ? "بانتظار" : r.status === "accepted" ? "مقبول" : r.status === "completed" ? "مكتمل" : r.status}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </MobileShell>
  );
}
