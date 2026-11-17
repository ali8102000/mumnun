import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Vary": "Origin",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Apikey, X-Client-Info",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type SupportMessage = { id: string; ticket_id: string; sender_id: string; message: string; is_staff: boolean; is_ai: boolean; created_at: string };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!url || !anonKey || !serviceKey || !geminiKey) return json({ error: "خدمة الرد الآلي غير مهيأة حالياً." }, 503);

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "سجّل دخولك أولاً." }, 401);
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) return json({ error: "جلسة الدخول غير صالحة." }, 401);

    const body = await req.json();
    const messageId = typeof body?.message_id === "string" ? body.message_id : "";
    if (!messageId) return json({ error: "معرّف الرسالة غير صحيح." }, 400);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: source, error: sourceError } = await admin.from("support_ticket_messages")
      .select("id,ticket_id,sender_id,message,is_staff,is_ai,created_at").eq("id", messageId).maybeSingle();
    if (sourceError || !source) return json({ error: "لم نعثر على رسالة الدعم." }, 404);
    if (source.sender_id !== auth.user.id || source.is_staff || source.is_ai) return json({ error: "غير مصرّح بهذه الرسالة." }, 403);

    const { data: ticket, error: ticketError } = await admin.from("support_tickets")
      .select("id,user_id,subject,description,category,status,needs_staff").eq("id", source.ticket_id).maybeSingle();
    if (ticketError || !ticket || ticket.user_id !== auth.user.id) return json({ error: "التذكرة غير متاحة لهذا الحساب." }, 403);

    const { data: existing } = await admin.from("support_ticket_messages")
      .select("id,message,is_ai").eq("reply_to_message_id", messageId).maybeSingle();
    if (existing) return json({ answer: existing.message, needs_staff: ticket.needs_staff, duplicate: true });

    const { data: history } = await admin.from("support_ticket_messages")
      .select("message,is_staff,is_ai,created_at").eq("ticket_id", ticket.id)
      .order("created_at", { ascending: false }).limit(8);
    const transcript = (history ?? []).reverse().map((m: Record<string, unknown>) =>
      `${m.is_ai ? "مساعد ممنون" : m.is_staff ? "موظف الدعم" : "المستخدم"}: ${String(m.message).slice(0, 1200)}`
    ).join("\n");

    const model = Deno.env.get("AI_CHAT_MODEL") ?? "gemini-3.1-flash-lite";
    const modelResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": geminiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: [
          "أنت مساعد خدمة عملاء تطبيق ممنون العراقي. أجب باللهجة العراقية الواضحة وباختصار واحترام.",
          "اعتمد فقط على وصف المشكلة وسياق المحادثة. لا تدّعِ أنك غيّرت الحساب أو ألغيت طلباً أو أعدت مبلغاً أو تواصلت مع سائق أو فني.",
          "لا تطلب كلمات مرور أو رموز تحقق أو بيانات بطاقات. لا تطلب معلومات شخصية حساسة.",
          "إذا كانت المشكلة تتعلق بأموال أو نزاع أو سلامة أو حظر حساب أو استرجاع مبلغ أو إجراء يحتاج صلاحية موظف، أو لم تكن متأكداً من الحل، اجعل needs_staff=true وأخبر المستخدم أن فريق الدعم سيتابعها.",
          "أعد JSON فقط بالشكل: {\"answer\":\"رد عراقي قصير\",\"needs_staff\":false}.",
        ].join(" ") }] },
        contents: [{ role: "user", parts: [{ text: `عنوان التذكرة: ${ticket.subject}\nالتصنيف: ${ticket.category}\nوصف المشكلة: ${ticket.description ?? ""}\nالمحادثة الأخيرة:\n${transcript}\n\nأجب عن آخر رسالة للمستخدم.` }] }],
        generationConfig: { temperature: 0.15, maxOutputTokens: 400, responseMimeType: "application/json" },
      }),
    });
    if (!modelResponse.ok) {
      console.error("[support-assistant] Gemini failed", modelResponse.status);
      return json({ error: "تعذر تجهيز الرد الآلي حالياً. تم الاحتفاظ برسالتك ويمكن لفريق الدعم متابعتها." }, 502);
    }
    const payload = await modelResponse.json();
    const raw = payload?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    let parsed: { answer?: string; needs_staff?: boolean };
    try { parsed = JSON.parse(raw); } catch { parsed = { answer: "وصلتنا رسالتك، ونحتاج مراجعة فريق الدعم حتى نساعدك بشكل صحيح.", needs_staff: true }; }
    const answer = typeof parsed.answer === "string" && parsed.answer.trim()
      ? parsed.answer.trim().slice(0, 1600)
      : "وصلتنا رسالتك، ونحتاج مراجعة فريق الدعم حتى نساعدك بشكل صحيح.";
    const needsStaff = parsed.needs_staff === true;

    const { error: insertError } = await admin.from("support_ticket_messages").insert({
      ticket_id: ticket.id,
      sender_id: ticket.user_id,
      message: answer,
      is_staff: false,
      is_ai: true,
      reply_to_message_id: messageId,
    });
    if (insertError) {
      const { data: duplicate } = await admin.from("support_ticket_messages")
        .select("id,message").eq("reply_to_message_id", messageId).maybeSingle();
      if (!duplicate) throw insertError;
      return json({ answer: duplicate.message, needs_staff: needsStaff, duplicate: true });
    }

    if (needsStaff) {
      const { error: updateError } = await admin.from("support_tickets")
        .update({ needs_staff: true, status: "waiting_staff" }).eq("id", ticket.id);
      if (updateError) console.error("[support-assistant] escalation flag failed", updateError.message);
    }
    return json({ answer, needs_staff: needsStaff });
  } catch (error) {
    console.error("[support-assistant]", error instanceof Error ? error.message : "unknown error");
    return json({ error: "تعذر الرد على رسالة الدعم حالياً." }, 500);
  }
});
