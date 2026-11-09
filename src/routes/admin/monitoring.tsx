import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { Loader2, ShieldCheck, Activity, Users, Car, TrendingUp, ChevronLeft, Ban, Flag, Headphones, Database } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { adminGetDashboardStats, adminListReports, adminResolveReport, adminBlockUser, adminUnblockUser, adminListMonitoringBlocks, adminListMonitoringTickets } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/monitoring")({ ssr: false, component: LiveMonitoring });

type MonitoringStats = { totalUsers: number; activeDrivers: number; activeWorkers: number; activeRequests: number };
type MonitoringReport = { id: string; reason: string; created_at: string; details: string | null; reported_id: string | null };
type MonitoringBlock = { id: string; user_id: string; reason: string | null; profiles?: { full_name: string | null } | null };
type MonitoringTicket = { id: string; subject: string; category: string; description: string };

function LiveMonitoring() {
  const { session, loading } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [stats, setStats] = useState<MonitoringStats>({ totalUsers: 0, activeDrivers: 0, activeWorkers: 0, activeRequests: 0 });
  const [reports, setReports] = useState<MonitoringReport[]>([]);
  const [blocks, setBlocks] = useState<MonitoringBlock[]>([]);
  const [tickets, setTickets] = useState<MonitoringTicket[]>([]);
  const [tab, setTab] = useState("live");
  const getDashboardStats = useServerFn(adminGetDashboardStats);
  const getReports = useServerFn(adminListReports);
  const resolveReport = useServerFn(adminResolveReport);
  const blockUser = useServerFn(adminBlockUser);
  const unblockUser = useServerFn(adminUnblockUser);
  const getBlocks = useServerFn(adminListMonitoringBlocks);
  const getTickets = useServerFn(adminListMonitoringTickets);

  const checkAuth = useCallback(async () => {
    if (!session) return;
    try {
      await getDashboardStats();
      setAuthorized(true);
    } catch {
      setAuthorized(false);
    }
  }, [session, getDashboardStats]);

  useEffect(() => { if (!session) return; checkAuth(); }, [session, checkAuth]);

  const loadData = useCallback(async () => {
    try {
      const [dashboard, pendingReports, currentBlocks, openTickets] = await Promise.all([
        getDashboardStats(),
        getReports({ data: { status: "pending", limit: 20 } }),
        getBlocks(),
        getTickets(),
      ]);
      setStats({
        totalUsers: dashboard.totalUsers,
        activeDrivers: dashboard.activeDrivers,
        activeWorkers: dashboard.activeWorkers,
        activeRequests: dashboard.activeRequests,
      });
      setReports(pendingReports as unknown as MonitoringReport[]);
      setBlocks(currentBlocks as unknown as MonitoringBlock[]);
      setTickets(openTickets as unknown as MonitoringTicket[]);
    } catch (error) {
      console.error("[admin-monitoring]", error);
      toast.error("تعذر تحديث بيانات المراقبة");
    }
  }, [getDashboardStats, getReports, getBlocks, getTickets]);

  useEffect(() => { if (authorized === true) loadData(); const interval = setInterval(() => { if (authorized) loadData(); }, 15000); return () => clearInterval(interval); }, [authorized, loadData]);

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;
  if (authorized === null) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!authorized) return (<div className="min-h-screen grid place-items-center px-5"><div className="text-center"><ShieldCheck className="h-12 w-12 text-muted-foreground mx-auto mb-2" /><div className="font-black">غير مصرّح</div><Link to="/admin" className="inline-block mt-4 text-primary text-sm font-bold">العودة للوحة الإدارة</Link></div></div>);

  return (
    <div className="min-h-screen px-5 pt-10 pb-20 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-2"><Link to="/admin" className="text-muted-foreground hover:text-foreground"><ChevronLeft className="h-5 w-5" /></Link><Activity className="h-6 w-6 text-primary" /><h1 className="text-2xl font-black">المراقبة المباشرة</h1></div>
      <div className="flex gap-1 mb-6 p-1 glass rounded-2xl">{[["live", "مباشر"], ["reports", "البلاغات"], ["blocks", "الحظر"], ["support", "الدعم"]].map(([key, label]) => (<button key={key} onClick={() => setTab(key)} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{label}</button>))}</div>
      {tab === "live" && (<div className="space-y-3"><div className="grid grid-cols-2 gap-3"><LiveStat icon={Users} label="إجمالي المستخدمين" value={stats.totalUsers} /><LiveStat icon={Car} label="سائقون نشطون" value={stats.activeDrivers} accent="text-emerald-600" /><LiveStat icon={TrendingUp} label="فنيون نشطون" value={stats.activeWorkers} accent="text-amber-600" /><LiveStat icon={Activity} label="طلبات نشطة" value={stats.activeRequests} accent="text-blue-600" /></div><div className="glass rounded-2xl p-3 text-center text-xs text-muted-foreground"><Database className="h-4 w-4 inline ml-1" />يتم تحديث البيانات كل 15 ثانية</div></div>)}
      {tab === "reports" && (<div className="space-y-2">{reports.length === 0 ? <div className="glass rounded-2xl p-8 text-center"><Flag className="h-8 w-8 text-muted-foreground mx-auto mb-2" /><div className="text-sm text-muted-foreground">لا توجد بلاغات معلقة</div></div> : reports.map((r) => (<div key={r.id} className="glass rounded-2xl p-3 text-sm"><div className="flex items-center justify-between mb-1"><span className="font-bold">{r.reason}</span><span className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString("ar-IQ")}</span></div>{r.details && <div className="text-xs text-muted-foreground">{r.details}</div>}<div className="flex gap-2 mt-2"><button onClick={async () => { try { await resolveReport({ data: { report_id: r.id, status: "resolved" } }); toast.success("تم حل البلاغ"); await loadData(); } catch { toast.error("تعذر حل البلاغ"); } }} className="text-xs px-3 py-1 rounded-lg bg-emerald-100 text-emerald-700 font-bold">حل</button><button onClick={async () => { try { if (r.reported_id) await blockUser({ data: { user_id: r.reported_id, reason: r.reason } }); await resolveReport({ data: { report_id: r.id, status: "resolved" } }); toast.success("تم حظر المستخدم وحل البلاغ"); await loadData(); } catch { toast.error("لا تملك صلاحية الحظر أو تعذر تنفيذ العملية"); } }} className="text-xs px-3 py-1 rounded-lg bg-red-100 text-red-700 font-bold">حظر المستخدم</button></div></div>))}</div>)}
      {tab === "blocks" && (<div className="space-y-2">{blocks.length === 0 ? <div className="glass rounded-2xl p-8 text-center"><Ban className="h-8 w-8 text-muted-foreground mx-auto mb-2" /><div className="text-sm text-muted-foreground">لا يوجد مستخدمون محظورون</div></div> : blocks.map((b) => (<div key={b.id} className="glass rounded-2xl p-3 text-sm"><div className="flex items-center justify-between"><div><div className="font-bold">{b.profiles?.full_name ?? b.user_id.slice(0, 8)}</div>{b.reason && <div className="text-xs text-muted-foreground">{b.reason}</div>}</div><button onClick={async () => { try { await unblockUser({ data: { user_id: b.user_id } }); toast.success("تم رفع الحظر"); await loadData(); } catch { toast.error("لا تملك صلاحية رفع الحظر"); } }} className="text-xs px-3 py-1 rounded-lg bg-emerald-100 text-emerald-700 font-bold">رفع الحظر</button></div></div>))}</div>)}
      {tab === "support" && (<div className="space-y-2">{tickets.length === 0 ? <div className="glass rounded-2xl p-8 text-center"><Headphones className="h-8 w-8 text-muted-foreground mx-auto mb-2" /><div className="text-sm text-muted-foreground">لا توجد تذاكر دعم مفتوحة</div></div> : tickets.map((t) => (<Link key={t.id} to="/support" className="block glass rounded-2xl p-3 text-sm"><div className="flex items-center justify-between"><div className="font-bold">{t.subject}</div><span className="text-[10px] text-muted-foreground">{t.category}</span></div><div className="text-xs text-muted-foreground mt-1">{t.description}</div></Link>))}</div>)}
    </div>
  );
}

function LiveStat({ icon: Icon, label, value, accent }: { icon: LucideIcon; label: string; value: number | string | null | undefined; accent?: string }) { return (<div className="glass rounded-2xl p-4"><Icon className={`h-5 w-5 mb-2 ${accent ?? "text-primary"}`} /><div className="text-xl font-black">{value ?? "—"}</div><div className="text-[10px] text-muted-foreground font-bold mt-0.5">{label}</div></div>); }
