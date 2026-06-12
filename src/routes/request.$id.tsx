import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Send, Loader2, CheckCircle2, Clock, Star, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/request/$id")({ ssr: false, component: RequestDetail });

function RequestDetail() {
  const { id } = Route.useParams();
  const { session, loading: authLoading } = useAuth();
  const [req, setReq] = useState<any>(null);
  const [other, setOther] = useState<any>(null);
  const [chat, setChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [myRating, setMyRating] = useState<any>(null);
  const [showRating, setShowRating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);


  async function loadAll() {
    const { data: r } = await supabase.from("service_requests").select("*").eq("id", id).single();
    if (!r) return;
    setReq(r);
    const otherId = session?.user.id === r.customer_id ? r.provider_id : r.customer_id;
    if (otherId) {
      const { data: p } = await supabase.from("profiles").select("id, full_name, phone, avatar_url").eq("id", otherId).single();
      setOther(p);
    }
    if (r.status !== "pending") {
      const { data: c } = await supabase.from("chats").select("*").eq("request_id", id).maybeSingle();
      setChat(c);
      if (c) {
        const { data: m } = await supabase.from("messages").select("*").eq("chat_id", c.id).order("created_at");
        setMessages(m ?? []);
      }
    }
    setLoading(false);
  }

  useEffect(() => { if (session) loadAll(); }, [session, id]);

  useEffect(() => {
    if (!chat) return;
    const ch = supabase.channel(`messages-${chat.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chat.id}` },
        (payload) => setMessages((m) => [...m, payload.new]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [chat]);

  useEffect(() => {
    if (!req) return;
    const ch = supabase.channel(`req-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "service_requests", filter: `id=eq.${id}` },
        () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [req?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  if (authLoading || loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!session) return <Navigate to="/auth" />;
  if (!req) return <div className="p-8 text-center">الطلب غير موجود</div>;

  async function send() {
    if (!draft.trim() || !chat) return;
    const text = draft.trim();
    setDraft("");
    const { error } = await supabase.from("messages").insert({
      chat_id: chat.id, sender_id: session!.user.id, content: text,
    });
    if (error) toast.error(error.message);
  }

  async function markCompleted() {
    await supabase.from("service_requests")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", id);
    toast.success("تم إنهاء الطلب");
  }

  const statusLabel = {
    pending: "بانتظار القبول",
    accepted: "تم القبول",
    in_progress: "قيد التنفيذ",
    completed: "مكتمل",
    cancelled: "ملغي",
  }[req.status as string];

  return (
    <div className="min-h-screen flex flex-col">
      <div className="glass-strong px-5 pt-10 pb-4 sticky top-0 z-30">
        <button onClick={() => history.back()} className="text-xs text-muted-foreground mb-2">← رجوع</button>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-black">{req.type === "taxi" ? "رحلة تكسي" : "خدمة فنية"}</div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
              {req.status === "pending" ? <Clock className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
              {statusLabel}
            </div>
          </div>
          {other && (
            <a href={`tel:${other.phone}`} className="glass h-11 w-11 rounded-2xl grid place-items-center btn-press">
              <Phone className="h-5 w-5 text-primary" />
            </a>
          )}
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        <div className="glass rounded-2xl p-4 text-sm space-y-2">
          <div><span className="text-muted-foreground text-xs">📍 الموقع: </span><span className="font-bold">{req.pickup_text}</span></div>
          {req.dest_text && <div><span className="text-muted-foreground text-xs">🎯 الوجهة: </span><span className="font-bold">{req.dest_text}</span></div>}
          {req.notes && <div><span className="text-muted-foreground text-xs">📝 ملاحظة: </span><span>{req.notes}</span></div>}
        </div>

        {other && req.status !== "pending" && (
          <div className="glass rounded-2xl p-4 flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center text-primary-foreground font-black">
              {(other.full_name || "?").charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm truncate">{other.full_name || "مستخدم"}</div>
              <div className="text-xs text-muted-foreground" dir="ltr">{other.phone}</div>
            </div>
            {req.status !== "completed" && session.user.id === req.customer_id && (
              <button onClick={markCompleted} className="text-xs px-3 py-2 rounded-xl bg-success text-success-foreground font-bold btn-press">إنهاء</button>
            )}
          </div>
        )}
      </div>

      {chat && (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-2 space-y-2">
            {messages.length === 0 && <div className="text-center text-xs text-muted-foreground py-8">ابدأ المحادثة 👋</div>}
            {messages.map((m) => {
              const mine = m.sender_id === session.user.id;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${mine ? "bg-primary text-primary-foreground" : "glass"}`}>
                    {m.content}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="glass-strong p-3 border-t border-border sticky bottom-0">
            <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="اكتب رسالة..."
                className="flex-1 bg-input border border-border rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-ring"
              />
              <button type="submit" className="h-11 w-11 rounded-2xl bg-primary grid place-items-center btn-press glow-primary">
                <Send className="h-5 w-5 text-primary-foreground" />
              </button>
            </form>
          </div>
        </>
      )}

      {req.status === "pending" && (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground flex-1">
          <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mb-3" />
          بانتظار قبول الطلب من أحد المزودين...
        </div>
      )}
    </div>
  );
}
