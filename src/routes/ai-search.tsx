import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { Bot, Search, Send, Sparkles, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/mobile-shell";

type ServiceResult = { id: string; slug: string; name_ar: string; name_en: string; icon: string; similarity: number };
type ChatMessage = { role: "user" | "assistant"; content: string };

export const Route = createFileRoute("/ai-search")({
  ssr: false,
  head: () => ({ meta: [{ title: "البحث الذكي | ممنون" }, { name: "description", content: "ابحث عن الخدمات واسأل مساعد ممنون الذكي." }] }),
  component: AiSearchPage,
});

function AiSearchPage() {
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<"search" | "chat">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ServiceResult[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;

  async function submit() {
    const value = query.trim();
    if (value.length < 2 || busy) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "search") {
        const { data, error: invokeError } = await supabase.functions.invoke("semantic-search", { body: { query: value } });
        if (invokeError) throw invokeError;
        setResults((data?.results ?? []) as ServiceResult[]);
      } else {
        setMessages((current) => [...current, { role: "user", content: value }]);
        setQuery("");
        const { data, error: invokeError } = await supabase.functions.invoke("mamnoon-assistant", { body: { question: value } });
        if (invokeError) throw invokeError;
        setMessages((current) => [...current, { role: "assistant", content: data?.answer ?? "ما حصلت إجابة حالياً." }]);
        setResults((data?.sources ?? []) as ServiceResult[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تنفيذ الطلب حالياً");
    } finally {
      setBusy(false);
    }
  }

  return (
    <MobileShell>
      <div className="relative px-5 pt-8 pb-28 space-y-5">
        <Link to="/home" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground"><ArrowRight className="h-4 w-4" /> رجوع للرئيسية</Link>
        <div>
          <div className="inline-flex items-center gap-2 text-primary text-xs font-black"><Sparkles className="h-4 w-4" /> ممنون الذكي</div>
          <h1 className="text-2xl font-black mt-1">شنو تحتاج اليوم؟</h1>
          <p className="text-sm text-muted-foreground mt-1">اكتب المشكلة بطريقتك، ونبحث لك عن الخدمة الأقرب للمعنى.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-2 p-1">
          <button onClick={() => setMode("search")} className={`rounded-xl py-3 text-sm font-bold ${mode === "search" ? "bg-background shadow-sm text-primary" : "text-muted-foreground"}`}><Search className="inline h-4 w-4 ml-1" /> بحث ذكي</button>
          <button onClick={() => setMode("chat")} className={`rounded-xl py-3 text-sm font-bold ${mode === "chat" ? "bg-background shadow-sm text-primary" : "text-muted-foreground"}`}><Bot className="inline h-4 w-4 ml-1" /> اسأل ممنون</button>
        </div>
        {mode === "chat" && (
          <div className="space-y-3">
            {messages.map((message, index) => (
              <div key={index} className={`max-w-[90%] rounded-2xl p-3 text-sm leading-7 ${message.role === "user" ? "mr-auto bg-primary text-primary-foreground" : "ml-auto glass"}`}>{message.content}</div>
            ))}
          </div>
        )}
        <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="flex items-center gap-2 rounded-2xl border border-border bg-background p-2 shadow-sm">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={mode === "search" ? "مثلاً: الكهرباء تفصل بالبيت..." : "اسأل عن الخدمات المتوفرة..."} maxLength={mode === "search" ? 180 : 500} className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm outline-none" />
          <button type="submit" disabled={busy || query.trim().length < 2} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50">{busy ? <span className="animate-spin">◌</span> : <Send className="h-4 w-4" />}</button>
        </form>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {busy && <p className="text-xs text-muted-foreground">جاري البحث في خدمات ممنون...</p>}
        {results.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-black">{mode === "chat" ? "الخدمات المرتبطة بسؤالك" : "الخدمات الأقرب لطلبك"}</h2>
            {results.map((item) => (
              <Link key={item.id} to="/request/new" search={{ type: item.slug }} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-xl">🛠️</div>
                <div className="min-w-0 flex-1"><div className="font-bold">{item.name_ar}</div><div className="text-xs text-muted-foreground">{item.name_en}</div></div>
                <span className="text-xs font-bold text-primary">اطلب</span>
              </Link>
            ))}
          </div>
        )}
        {!busy && !error && mode === "search" && results.length === 0 && (
          <div className="rounded-2xl bg-surface-2 p-5 text-center text-sm text-muted-foreground">جرّب تكتب المشكلة أو الشي اللي تريد تصلحه، مثل: «المي يتسرب من الحنفية».</div>
        )}
      </div>
    </MobileShell>
  );
}
