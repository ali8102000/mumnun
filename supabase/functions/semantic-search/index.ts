import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
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
  const endpoint = Deno.env.get("EMBEDDINGS_API_URL");
  const apiKey = Deno.env.get("EMBEDDINGS_API_KEY");
  const model = Deno.env.get("EMBEDDINGS_MODEL") ?? "intfloat/multilingual-e5-small";
  if (!endpoint || !apiKey) throw new Error("EMBEDDINGS_NOT_CONFIGURED");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: `${prefix}: ${input}`,
      dimensions: 384,
      encoding_format: "float",
    }),
  });
  if (!response.ok) {
    console.error("[semantic-search] embedding provider failed", response.status);
    throw new Error("EMBEDDING_PROVIDER_FAILED");
  }
  const payload = await response.json();
  const vector = payload?.data?.[0]?.embedding ?? payload?.embedding;
  if (!Array.isArray(vector) || vector.length !== 384 || vector.some((n: unknown) => typeof n !== "number" || !Number.isFinite(n))) {
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

    const embeddingEndpoint = Deno.env.get("EMBEDDINGS_API_URL");
    const embeddingKey = Deno.env.get("EMBEDDINGS_API_KEY");
    if (!embeddingEndpoint || !embeddingKey) {
      return json({ error: "البحث الدلالي ينتظر ربط مزوّد تضمين متعدد اللغات. البحث العادي يبقى متاحاً." }, 503);
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const model = Deno.env.get("EMBEDDINGS_MODEL") ?? "intfloat/multilingual-e5-small";
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

    // Keep the small catalog in sync lazily. Only service names and curated synonyms are embedded.
    for (const service of services ?? []) {
      if (indexedModels.get(service.id) === model) continue;
      const content = [
        service.name_ar,
        service.name_en,
        service.slug.replaceAll("_", " "),
        `خدمة ${service.name_ar}`,
      ].filter(Boolean).join(" | ");
      const embedding = await createEmbedding(content, "passage");
      const { error } = await admin.from("service_embeddings").upsert({
        service_id: service.id,
        content,
        model,
        embedding,
        updated_at: new Date().toISOString(),
      }, { onConflict: "service_id" });
      if (error) throw error;
    }

    const queryEmbedding = await createEmbedding(query, "query");
    const { data: matches, error: matchError } = await admin.rpc("match_service_embeddings", {
      query_embedding: queryEmbedding,
      match_threshold: 0.28,
      match_count: 12,
    });
    if (matchError) throw matchError;

    const rank = new Map((matches ?? []).map((item, index) => [item.service_id, { score: item.similarity, rank: index }]));
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
