import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { Loader2, ShieldCheck, Activity, Users, Car, TrendingUp, ChevronLeft, Ban, Flag, Headphones, Database, Send } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { adminGetDashboardStats, adminListReports, adminResolveReport, adminBlockUser, adminUnblockUser, adminListMonitoringBlocks, adminListMonitoringTickets, adminListMonitoringTicketMessages, adminReplyToSupportTicket } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/monitoring")({ ssr: false, component: LiveMonitoring });

type MonitoringStats = { totalUsers: number; activeDrivers: number; activeWorkers: number; activeRequests: number };
type MonitoringReport = { id: string; reason: string; created_at: string; details: string | null; reported_id: string | null };
type MonitoringBlock = { id: string; user_id: string; reason: string | null; profiles?: { full_name: string | null } | null };
type MonitoringTicket = { id: string; user_id: string; subject: string; category: string; description: string; status: string; needs_staff?: boolean };
type MonitoringTicketMessage = { id: string; sender_id: string; message: string; is_staff: boolean; is_ai?: boolean; created_at: string };

function LiveMonitoring() {
  const { session, loading } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [stats, setStats] = useState<MonitoringStats>({ totalUsers: 0, activeDrivers: 0, activeWorkers: 0, activeRequests: 0 });
  const [reports, setReports] = useState<MonitoringReport[]>([]);
  const [blocks, setBlocks] = useState<MonitoringBlock[]>([]);
  const [tickets, setTickets] = useState<MonitoringTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<MonitoringTicket | null>(null);
  const [ticketMessages, setTicketMessages] = useState<MonitoringTicketMessage[]>([]);
  const [ticketReply, setTicketReply] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [tab, setTab] = useState("live");
  const getDashboardStats = useServerFn(adminGetDashboardStats);
  const getReports = useServerFn(adminListReports);
  const resolveReport = useServerFn(adminResolveReport);
  const blockUser = useServerFn(adminBlockUser);
  const unblockUser = useServerFn(adminUnblockUser);
  const getBlocks = useServerFn(adminListMonitoringBlocks);
  const getTickets = useServerFn(adminListMonitoringTickets);
  const getTicketMessages = useServerFn(adminListMonitoringTicketMessages);
  const replyToTicket = useServerFn(adminReplyToSupportTicket);

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
  useEffect(() => {
    if (!selectedTicket) { setTicketMessages([]); return; }
    let active = true;
    getTicketMessages({ data: { ticket_id: selectedTicket.id } })
      .then((rows) => { if (active) setTicketMessages(rows as unknown as MonitoringTicketMessage[]); })
      .catch(() => { if (active) toast.error("تعذر تحميل رسائل التذكرة"); });
    return () => { active = false; };
  }, [selectedTicket?.id, getTicketMessages]);

  async function sendStaffReply() {
    if (!selectedTicket || ticketReply.trim().length < 2 || replyBusy) return;
    setReplyBusy(true);
    try {
      await replyToTicket({ data: { ticket_id: selectedTicket.id, message: ticketReply.trim() } });
      setTicketReply("");
      const rows = await getTicketMessages({ data: { ticket_id: selectedTicket.id } });
      setTicketMessages(rows as unknown as MonitoringTicketMessage[]);
      toast.success("تم إرسال رد فريق الدعم");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إرسال الرد");
    } finally { setReplyBusy(false); }
  }


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
      {tab === "support" && (selectedTicket ? (
        <div className="space-y-3">
          <button onClick={() => setSelectedTicket(null)} className="text-sm font-bold text-primary">← العودة إلى تذاكر الدعم</button>
          <div className="glass rounded-2xl p-3"><div className="font-black">{selectedTicket.subject}</div><div className="text-xs text-muted-foreground mt-1">{selectedTicket.description}</div><div className="text-[10px] text-amber-700 font-bold mt-2">{selectedTicket.needs_staff || selectedTicket.status === "waiting_staff" ? "تحتاج متابعة بشرية" : "تذكرة مفتوحة"}</div></div>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {ticketMessages.map((m) => <div key={m.id} className={`flex ${m.is_ai || m.is_staff ? "justify-start" : "justify-end"}`}><div className="glass rounded-2xl p-3 max-w-[85%] text-sm"><div>{m.message}</div><div className="text-[9px] text-primary font-bold mt-1">{m.is_ai ? "مساعد ممنون" : m.is_staff ? "فريق الدعم" : "المستخدم"}</div></div></div>)}
          </div>
          <div className="flex gap-2"><input value={ticketReply} onChange={(e) => setTicketReply(e.target.value)} placeholder="اكتب رد فريق الدعم..." className="flex-1 glass rounded-xl px-3 py-3 text-sm outline-none" /><button onClick={() => void sendStaffReply()} disabled={replyBusy || ticketReply.trim().length < 2} className="px-4 rounded-xl bg-primary text-primary-foreground disabled:opacity-50"><Send className="h-4 w-4" /></button></div>
        </div>
      ) : (<div className="space-y-2">{tickets.length === 0 ? <div className="glass rounded-2xl p-8 text-center"><Headphones className="h-8 w-8 text-muted-foreground mx-auto mb-2" /><div className="text-sm text-muted-foreground">لا توجد تذاكر تحتاج متابعة</div></div> : tickets.map((t) => (<button key={t.id} onClick={() => setSelectedTicket(t)} className="w-full text-right glass rounded-2xl p-3 text-sm"><div className="flex items-center justify-between"><div className="font-bold">{t.subject}</div><span className="text-[10px] text-amber-700">{t.needs_staff || t.status === "waiting_staff" ? "تحتاج موظف" : "مفتوحة"}</span></div><div className="text-xs text-muted-foreground mt-1">{t.category} · {t.description}</div></button>))}</div>))}
    </div>
  );
}

function LiveStat({ icon: Icon, label, value, accent }: { icon: LucideIcon; label: string; value: number | string | null | undefined; accent?: string }) { return (<div className="glass rounded-2xl p-4"><Icon className={`h-5 w-5 mb-2 ${accent ?? "text-primary"}`} /><div className="text-xl font-black">{value ?? "—"}</div><div className="text-[10px] text-muted-foreground font-bold mt-0.5">{label}</div></div>); }
