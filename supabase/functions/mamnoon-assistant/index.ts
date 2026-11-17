import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Vary": "Origin",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Apikey, X-Client-Info",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const authorization = req.headers.get("Authorization");
    if (!url || !anonKey) return json({ error: "إعدادات المساعد غير مكتملة." }, 503);
    if (!authorization?.startsWith("Bearer ")) return json({ error: "سجّل دخولك أولاً." }, 401);

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) return json({ error: "جلسة الدخول غير صالحة." }, 401);

    const body = await req.json();
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (question.length < 2 || question.length > 500) return json({ error: "اكتب سؤالاً من حرفين إلى 500 حرف." }, 400);

    const searchResponse = await fetch(`${url}/functions/v1/semantic-search`, {
      method: "POST",
      headers: {
        "Authorization": authorization,
        "apikey": anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: question }),
    });
    const searchData = await searchResponse.json();
    if (!searchResponse.ok) return json({ error: searchData?.error ?? "تعذر البحث في خدمات ممنون." }, searchResponse.status);

    const chatEndpoint = Deno.env.get("AI_CHAT_API_URL");
    const chatKey = Deno.env.get("AI_CHAT_API_KEY");
    const chatModel = Deno.env.get("AI_CHAT_MODEL");
    if (!chatEndpoint || !chatKey || !chatModel) {
      return json({
        answer: "أكدر أساعدك بالعثور على الخدمة المناسبة. هاي أقرب الخدمات الموجودة حالياً بممنون. الأسعار والتوفر النهائي نتحقق منهن من داخل الطلب، وما أريد أعطيك سعر غير مؤكد.",
        sources: searchData.results ?? [],
        mode: "grounded-search-fallback",
      });
    }

    const context = (searchData.results ?? []).map((item: Record<string, unknown>) =>
      `الخدمة: ${item.name_ar} | الاسم: ${item.name_en} | الرمز: ${item.slug}`
    ).join("\n");
    const response = await fetch(chatEndpoint, {
      method: "POST",
      headers: { "Authorization": `Bearer ${chatKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: chatModel,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: "أنت مساعد ممنون العراقي. أجب بالعربية العراقية الواضحة وباختصار. اعتمد حصراً على سياق الخدمات المرفق. لا تخترع أسعاراً أو مزودين أو مواعيد أو تغطية جغرافية. إذا لم توجد المعلومة في السياق فقل إنها غير متاحة حالياً ووجّه المستخدم لفتح الطلب أو التواصل مع الدعم. لا تكشف أي بيانات خاصة.",
          },
          { role: "user", content: `سياق قاعدة بيانات ممنون:\n${context || "لا توجد خدمات مطابقة."}\n\nسؤال المستخدم: ${question}` },
        ],
      }),
    });
    if (!response.ok) {
      console.error("[mamnoon-assistant] model provider failed", response.status);
      return json({ error: "المساعد الذكي غير متاح حالياً. جرّب البحث بالخدمات." }, 502);
    }
    const completion = await response.json();
    const answer = completion?.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) return json({ error: "ما قدر المساعد يكوّن إجابة موثوقة." }, 502);

    return json({ answer: answer.trim(), sources: searchData.results ?? [], mode: "grounded-ai" });
  } catch (error) {
    console.error("[mamnoon-assistant]", error instanceof Error ? error.message : "unknown error");
    return json({ error: "تعذر تشغيل مساعد ممنون حالياً." }, 500);
  }
});
