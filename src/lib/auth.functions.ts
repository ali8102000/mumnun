import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const loginWithIdentifier = createServerFn({ method: "POST" })
  .validator((d) =>
    z
      .object({
        identifier: z.string().trim().min(3).max(255),
        password: z.string().min(6).max(128),
        supabaseUrl: z.string().url().max(500),
        publishableKey: z.string().min(10).max(2048),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const id = data.identifier.trim();
    let email = id.toLowerCase();

    if (!id.includes("@")) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: foundEmail, error: lookupError } = await supabaseAdmin
        .rpc("lookup_email_by_phone", { _phone: id });
      if (lookupError) throw new Error("تعذر التحقق من بيانات الدخول");
      const digits = id.replace(/[^\\d]/g, "");
      email = foundEmail ? String(foundEmail).toLowerCase() : `phone${digits}@mamnoon.app`;
    }

    // Resolve the real email and authenticate in one server call; never send
    // another customer's email address back to an unauthenticated browser.
    const authClient = createClient(data.supabaseUrl, data.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error } = await authClient.auth.signInWithPassword({
      email,
      password: data.password,
    });
    if (error || !authData.session) throw new Error("بيانات الدخول غير صحيحة");
    return { session: authData.session };
  });

export const sendPasswordReset = createServerFn({ method: "POST" })
  .validator((d) =>
    z
      .object({
        identifier: z.string().trim().min(3).max(255),
        redirectTo: z.string().url().max(500),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const id = data.identifier.trim();
    const isEmail = id.includes("@");

    let email: string | null = null;
    if (isEmail) {
      email = id.toLowerCase();
    } else {
      const { data: emailResult } = await supabaseAdmin
        .rpc("lookup_email_by_phone", { _phone: id });
      email = emailResult ? String(emailResult) : null;
    }

    if (!email) {
      return { ok: true };
    }

    try {
      const redirectUrl = new URL(data.redirectTo);
      const allowedOrigins = (process.env.ALLOWED_REDIRECT_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (allowedOrigins.length && !allowedOrigins.includes(redirectUrl.origin)) {
        return { ok: true, hasEmail: false };
      }
    } catch {
      return { ok: true, hasEmail: false };
    }

    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: data.redirectTo,
    });
    if (error) console.error("[sendPasswordReset]", error.message);
    return { ok: true };
  });
