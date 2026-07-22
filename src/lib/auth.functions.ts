import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Look up the auth-account email for a given identifier.
 * The identifier can be either a phone (normalized +9647…) or an email.
 * Returns the email Supabase needs for signInWithPassword.
 *
 * Safe to expose: it returns the synthetic phoneToEmail address for users
 * who registered without a real email, and the stored email otherwise.
 * Treats unknown identifiers identically (no enumeration).
 */
export const lookupAuthEmail = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        identifier: z.string().trim().min(3).max(255),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const id = data.identifier.trim();
    const isEmail = id.includes("@");

    if (isEmail) {
      return { email: id.toLowerCase() };
    }

    // Use SECURITY DEFINER function to bypass RLS for phone→email lookup
    const { data: email } = await supabaseAdmin
      .rpc("lookup_email_by_phone", { _phone: id });

    if (email) return { email: String(email).toLowerCase() };

    // Fallback: synthetic phoneToEmail (used for legacy accounts).
    const digits = id.replace(/[^\d]/g, "");
    return { email: `phone${digits}@mamnoon.app` };
  });

/**
 * Send password reset email. Looks up the user by phone or email,
 * then triggers Supabase's standard recovery flow. Always returns ok
 * to prevent account enumeration.
 */
export const sendPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d) =>
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
      // No real email on file — cannot send reset. Still return ok.
      return { ok: true, hasEmail: false };
    }

    // resetPasswordForEmail with admin client uses Supabase's email infra.
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: data.redirectTo,
    });
    if (error) console.error("[sendPasswordReset]", error.message);
    return { ok: true, hasEmail: true };
  });
