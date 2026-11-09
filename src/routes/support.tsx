import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Headphones, Plus, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/support")({ ssr: false,
  head: () => ({ meta: [
    { title: "الدعم | ممنون" },
    { name: "description", content: "تواصل مع دعم ممنون وتابع طلبات المساعدة." },
    { property: "og:title", content: "الدعم | ممنون" },
    { property: "og:description", content: "تواصل مع دعم ممنون وتابع طلبات المساعدة." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }), component: SupportCenter });

type Ticket = {
  id: string;
  subject: string;
  description: string;
  category: string;
  status: string;
  created_at: string;
};

type TicketMessage = {
  id: string;
  sender_id: string;
  message: string;
  is_staff: boolean;
  created_at: string;
};
type QueryResult<T> = { data: T | null; error: { message: string } | null };
type InsertShape<T> = T extends Array<infer Row> ? Partial<Row> : Partial<T>;
interface SupportQuery<T> extends PromiseLike<QueryResult<T>> {
  select(columns?: string): SupportQuery<T>;
  eq(column: string, value: string): SupportQuery<T>;
  order(column: string, options?: { ascending?: boolean }): SupportQuery<T>;
  insert(values: InsertShape<T> | InsertShape<T>[]): SupportQuery<T>;
  maybeSingle(): Promise<QueryResult<T extends Array<infer Row> ? Row : T>>;
}
type SupportClient = {
  from(table: "support_tickets"): SupportQuery<Ticket[]>;
  from(table: "support_ticket_messages"): SupportQuery<TicketMessage[]>;
  channel(name: string): {
    on(event: "postgres_changes", filter: { event: "INSERT"; schema: "public"; table: "support_ticket_messages"; filter: string }, callback: (payload: { new: TicketMessage }) => void): {
      subscribe(): unknown;
    };
  };
  removeChannel(channel: unknown): Promise<unknown>;
};


function SupportCenter() {
  const { session, loading } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const supportDb = supabase as unknown as SupportClient;

  const loadTickets = useCallback(async () => {
    if (!session) return;
    setLoadingTickets(true);
    const { data, error } = await supportDb
      .from("support_tickets")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error("تعذّر تحميل تذاكر الدعم");
    setTickets(data ?? []);
    setLoadingTickets(false);
  }, [session, supportDb]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const loadMessages = useCallback(async (ticketId: string) => {
    const { data, error } = await supportDb
      .from("support_ticket_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at");
    if (error) toast.error("تعذّر تحميل رسائل التذكرة");
    setMessages(data ?? []);

    const channel = supportDb
      .channel(`support-${ticketId}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_ticket_messages", filter: `ticket_id=eq.${ticketId}` }, (payload) => {
        setMessages((previous) => [...previous, payload.new]);
      })
      .subscribe();

    return () => { void supportDb.removeChannel(channel); };
  }, [supportDb]);

  useEffect(() => {
    if (!selected) return;
    let cleanup: (() => void) | undefined;
    void loadMessages(selected.id).then((dispose) => { cleanup = dispose; });
    return () => { cleanup?.(); };
  }, [selected, loadMessages]);

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;

  async function createTicket() {
    if (!newSubject.trim() || !newDesc.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await supportDb
        .from("support_tickets")
        .insert({
          user_id: session!.user.id,
          subject: newSubject,
          description: newDesc,
          category: newCategory,
        })
        .select()
        .maybeSingle();
      if (error) throw error;
      toast.success("تم إنشاء التذكرة");
      setShowNew(false);
      setNewSubject("");
      setNewDesc("");
      void loadTickets();
      if (data) setSelected(data);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "حدث خطأ غير متوقع");
    } finally {
      setBusy(false);
    }
  }

  async function sendReply() {
    if (!reply.trim() || !selected) return;
    setBusy(true);
    try {
      const { error } = await supportDb
        .from("support_ticket_messages")
        .insert({
          ticket_id: selected.id,
          sender_id: session!.user.id,
          message: reply,
          is_staff: false,
        });
      if (error) throw error;
      setReply("");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "حدث خطأ غير متوقع");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen px-5 pt-10 pb-20 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Headphones className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-black">مركز الدعم</h1>
      </div>

      {selected ? (
        <div>
          <button onClick={() => setSelected(null)} className="text-sm text-muted-foreground mb-3">
            ← العودة للتذاكر
          </button>
          <div className="glass rounded-2xl p-4 mb-4">
            <div className="font-black text-sm">{selected.subject}</div>
            <div className="text-xs text-muted-foreground mt-1">{selected.description}</div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full mt-2 inline-block ${
              selected.status === "open" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
            }`}>
              {selected.status === "open" ? "مفتوحة" : "مغلقة"}
            </span>
          </div>

          <div className="space-y-2 mb-4 max-h-96 overflow-y-auto">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.sender_id === session.user.id ? "justify-end" : "justify-start"}`}>
                <div className={`glass rounded-2xl px-3 py-2 max-w-[80%] text-sm ${m.is_staff ? "border-2 border-primary/20" : ""}`}>
                  <div>{m.message}</div>
                  {m.is_staff && <div className="text-[9px] text-primary font-bold mt-0.5">فريق الدعم</div>}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendReply()}
              placeholder="اكتب ردك..."
              className="flex-1 glass rounded-xl px-4 py-3 text-sm outline-none"
            />
            <button onClick={sendReply} disabled={busy} className="p-3 rounded-xl bg-primary text-primary-foreground">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            onClick={() => setShowNew(!showNew)}
            className="w-full glass rounded-2xl p-3 flex items-center justify-center gap-2 text-sm font-bold text-primary border-2 border-dashed border-primary/30 mb-4"
          >
            <Plus className="h-4 w-4" /> تذكرة جديدة
          </button>

          {showNew && (
            <div className="glass rounded-2xl p-4 mb-4 space-y-3">
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full glass rounded-xl px-4 py-3 text-sm font-bold outline-none"
              >
                <option value="general">عام</option>
                <option value="technical">مشكلة تقنية</option>
                <option value="billing">فواتير وأشتراكات</option>
                <option value="complaint">شكوى</option>
              </select>
              <input
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder="عنوان المشكلة"
                className="w-full glass rounded-xl px-4 py-3 text-sm outline-none"
              />
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="وصف المشكلة..."
                rows={3}
                className="w-full glass rounded-xl px-4 py-3 text-sm outline-none"
              />
              <button
                onClick={createTicket}
                disabled={busy}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "إرسال"}
              </button>
            </div>
          )}

          {loadingTickets ? (
            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
          ) : tickets.length === 0 ? (
            <div className="glass rounded-2xl p-8 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <div className="text-sm text-muted-foreground">لا توجد تذاكر دعم</div>
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelected(t)}
                  className="w-full glass rounded-2xl p-3 text-right"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-sm">{t.subject}</div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      t.status === "open" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                    }`}>
                      {t.status === "open" ? "مفتوحة" : "مغلقة"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{t.category}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
