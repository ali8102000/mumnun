import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Send, Loader2, CheckCircle2, Clock, Star, X, Navigation } from "lucide-react";
import { toast } from "sonner";
import { LiveTrackMap } from "@/components/live-track-map";
import { useLiveTracking } from "@/lib/use-live-tracking";

const VEHICLE_CAT_META: Record<string, { label: string; emoji: string; gradient: string }> = {
  economy: { label: "ممنون اقتصادي", emoji: "🚗", gradient: "from-emerald-400 to-teal-500" },
  premium: { label: "ممنون المتميز", emoji: "🚙", gradient: "from-sky-500 to-indigo-600" },
  luxury:  { label: "ممنون فاخر",   emoji: "🏎️", gradient: "from-amber-400 to-orange-500" },
};

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
    // existing rating by me?
    if (session?.user) {
      const { data: rate } = await supabase.from("ratings").select("*").eq("request_id", id).eq("rater_id", session.user.id).maybeSingle();
      setMyRating(rate);
      if (r.status === "completed" && !rate) setShowRating(true);
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

        {req.status === "completed" && other && (
          myRating ? (
            <div className="glass rounded-2xl p-4 flex items-center gap-2 text-sm">
              <span className="font-bold">تقييمك:</span>
              <div className="flex gap-0.5">
                {[1,2,3,4,5].map(s => (
                  <Star key={s} className={`h-4 w-4 ${s <= myRating.stars ? "text-primary fill-primary" : "text-muted-foreground"}`} />
                ))}
              </div>
              {myRating.comment && <span className="text-muted-foreground text-xs truncate">«{myRating.comment}»</span>}
            </div>
          ) : (
            <button onClick={() => setShowRating(true)} className="w-full glass rounded-2xl p-4 flex items-center justify-center gap-2 btn-press font-bold text-sm text-primary">
              <Star className="h-5 w-5 fill-primary" /> قيّم الخدمة
            </button>
          )
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

      {showRating && other && (
        <RatingModal
          target={other}
          onClose={() => setShowRating(false)}
          onSubmit={async (stars, comment) => {
            const { data, error } = await supabase.from("ratings").insert({
              request_id: id,
              rater_id: session.user.id,
              ratee_id: other.id,
              stars,
              comment: comment || null,
            }).select().single();
            if (error) { toast.error(error.message); return; }
            setMyRating(data);
            setShowRating(false);
            toast.success("شكراً على تقييمك ⭐");
          }}
        />
      )}
    </div>
  );
}

function RatingModal({ target, onClose, onSubmit }: { target: any; onClose: () => void; onSubmit: (stars: number, comment: string) => Promise<void> }) {
  const [stars, setStars] = useState(5);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 backdrop-blur-sm p-5" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm glass-strong rounded-3xl p-6 shadow-elegant relative animate-in fade-in zoom-in-95">
        <button onClick={onClose} className="absolute top-3 left-3 h-9 w-9 rounded-full grid place-items-center text-muted-foreground hover:bg-secondary btn-press">
          <X className="h-5 w-5" />
        </button>
        <div className="text-center mb-4">
          <div className="h-16 w-16 mx-auto rounded-3xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center text-primary-foreground font-black text-2xl mb-3">
            {(target.full_name || "?").charAt(0)}
          </div>
          <div className="font-black text-lg">كيف كانت تجربتك؟</div>
          <div className="text-xs text-muted-foreground mt-1">قيّم {target.full_name || "المزود"}</div>
        </div>

        <div className="flex justify-center gap-1.5 my-5" onMouseLeave={() => setHover(0)}>
          {[1,2,3,4,5].map((s) => {
            const active = s <= (hover || stars);
            return (
              <button
                key={s}
                type="button"
                onMouseEnter={() => setHover(s)}
                onClick={() => setStars(s)}
                className="btn-press p-1 transition-transform"
                style={{ transform: active ? "scale(1.1)" : "scale(1)" }}
              >
                <Star className={`h-10 w-10 transition ${active ? "text-primary fill-primary drop-shadow-[0_4px_12px_var(--primary)]" : "text-muted-foreground"}`} />
              </button>
            );
          })}
        </div>
        <div className="text-center text-xs text-muted-foreground mb-3">
          {["", "سيء جداً", "سيء", "مقبول", "جيد", "ممتاز"][hover || stars]}
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, 500))}
          placeholder="اكتب تعليقك (اختياري)..."
          rows={3}
          className="w-full bg-input border border-border rounded-2xl px-4 py-3 text-sm outline-none focus:border-ring resize-none"
        />

        <button
          disabled={busy}
          onClick={async () => { setBusy(true); await onSubmit(stars, comment.trim()); setBusy(false); }}
          className="mt-4 w-full h-12 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-black btn-press glow-primary disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : "إرسال التقييم"}
        </button>
      </div>
    </div>
  );
}

