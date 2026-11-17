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

async function createEmbedding(input: string, prefix: "query" | "passage") {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const model = Deno.env.get("EMBEDDINGS_MODEL") ?? "gemini-embedding-001";
  if (!apiKey) throw new Error("EMBEDDINGS_NOT_CONFIGURED");

  const modelId = model.startsWith("models/") ? model.slice(7) : model;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:embedContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: { parts: [{ text: input }] },
      taskType: prefix === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT",
      outputDimensionality: 768,
    }),
  });
  if (!response.ok) {
    console.error("[semantic-search] embedding provider failed", response.status);
    throw new Error("EMBEDDING_PROVIDER_FAILED");
  }
  const payload = await response.json();
  const vector = payload?.embedding?.values;
  if (!Array.isArray(vector) || vector.length !== 768 || vector.some((n: unknown) => typeof n !== "number" || !Number.isFinite(n))) {
    throw new Error("INVALID_EMBEDDING_VECTOR");
  }
  return vector as number[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return json({ error: "إعدادات البحث غير مكتملة." }, 503);

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "سجّل دخولك أولاً." }, 401);
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) return json({ error: "جلسة الدخول غير صالحة." }, 401);

    const body = await req.json();
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (query.length < 2 || query.length > 180) return json({ error: "اكتب عبارة بحث من حرفين إلى 180 حرفاً." }, 400);

    const embeddingKey = Deno.env.get("GEMINI_API_KEY");
    if (!embeddingKey) {
      return json({ error: "البحث الدلالي ينتظر ربط مزوّد تضمين متعدد اللغات. البحث العادي يبقى متاحاً." }, 503);
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const model = Deno.env.get("EMBEDDINGS_MODEL") ?? "gemini-embedding-001";
    const { data: services, error: servicesError } = await admin
      .from("services")
      .select("id, slug, name_ar, name_en, icon")
      .order("sort_order", { ascending: true });
    if (servicesError) throw servicesError;

    const { data: indexed, error: indexError } = await admin
      .from("service_embeddings")
      .select("service_id, model");
    if (indexError) throw indexError;
    const indexedModels = new Map((indexed ?? []).map((row) => [row.service_id, row.model]));

    // Iraqi Arabic synonyms help the multilingual model understand everyday phrasing.
    const synonyms: Record<string, string> = {
      electric_setup: "كهرباء البيت تمديدات اسلاك تأسيس كهربائي تماس القاطع يفصل الكهرباء عطل كهرباء بالبيت",
      electric_street: "اسلاك الشارع كيبل كهرباء ربط كهرباء خارجي تصليح سلك كهرباء",
      plumbing: "تسرب مي ماء حنفية انبوب بايب مجاري انسداد تصليح سباك",
      ac_repair: "سبلت مكيف تبريد حار غاز فريون تنظيف المكيف تصليح المكيف",
      washer_repair: "غسالة ملابس ما تعصر ما تسحب مي تصليح غسالة",
      fridge_repair: "ثلاجة ما تبرد فريزر تبريد تصليح براد",
      stove_repair: "طباخ غاز فرن شعلة ما تشتغل تصليح فرن",
      cleaning: "تنظيف البيت غسل الارضيات تنظيف مطبخ حمام عاملات تنظيف",
      wood_carpentry: "نجار خشب باب دولاب مطبخ اثاث تصليح خشب",
      carpentry_form: "نجارة قالب خشب صب كونكريت سقف بناء",
      blacksmith: "حداد ابواب شبابيك حديد سياج لحام",
      internet_install: "نصب انترنت راوتر واي فاي ضعف الشبكة تمديد كيبل",
      security_cameras: "كاميرات مراقبة نصب كامرات تسجيل DVR حماية",
      phone_repair: "تصليح موبايل شاشة بطارية شحن هاتف",
      computer_repair: "تصليح حاسبة لابتوب ويندوز كمبيوتر",
    };

    // Keep the small catalog in sync lazily. Only service names and curated synonyms are embedded.
    for (const service of services ?? []) {
      if (indexedModels.get(service.id) === model) continue;
      const content = [
        service.name_ar,
        service.name_en,
        service.slug.replaceAll("_", " "),
        `خدمة ${service.name_ar}`,
        synonyms[service.slug] ?? "",
      ].filter(Boolean).join(" | ");
      const embedding = await createEmbedding(content, "passage");
      const { error } = await admin.from("service_embeddings").upsert({
        service_id: service.id,
        content,
        model,
        embedding: JSON.stringify(embedding),
        updated_at: new Date().toISOString(),
      }, { onConflict: "service_id" });
      if (error) throw error;
    }

    const queryEmbedding = await createEmbedding(query, "query");
    const { data: matches, error: matchError } = await admin.rpc("match_service_embeddings", {
      query_embedding: queryEmbedding,
      match_threshold: 0.42,
      match_count: 12,
    });
    if (matchError) throw matchError;

    const rank = new Map<string, { score: number; rank: number }>();
    (matches ?? []).forEach((item: { service_id: string; similarity: number }, index: number) => {
      rank.set(item.service_id, { score: Number(item.similarity), rank: index });
    });
    const matchedIds = [...rank.keys()];
    const { data: matchedServices, error: matchedError } = matchedIds.length
      ? await admin.from("services").select("id, slug, name_ar, name_en, icon").in("id", matchedIds)
      : { data: [], error: null };
    if (matchedError) throw matchedError;

    const results = (matchedServices ?? [])
      .sort((a, b) => (rank.get(a.id)?.rank ?? 999) - (rank.get(b.id)?.rank ?? 999))
      .map((service) => ({
        id: service.id,
        slug: service.slug,
        name_ar: service.name_ar,
        name_en: service.name_en,
        icon: service.icon,
        similarity: Number((rank.get(service.id)?.score ?? 0).toFixed(3)),
      }));

    return json({ query, results, model, count: results.length });
  } catch (error) {
    console.error("[semantic-search]", error instanceof Error ? error.message : "unknown error");
    if (error instanceof Error && error.message === "EMBEDDINGS_NOT_CONFIGURED") {
      return json({ error: "مزوّد البحث متعدد اللغات غير مربوط بعد." }, 503);
    }
    return json({ error: "تعذر تنفيذ البحث الذكي حالياً." }, 500);
  }
});
