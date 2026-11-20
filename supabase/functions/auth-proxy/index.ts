import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN");
const corsHeaders = {
  ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
  "Vary": "Origin",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeError(msg: string): string {
  const known = [
    "Invalid login credentials",
    "User already registered",
    "Password should be at least 6 characters",
    "Email rate limit exceeded",
  ];
  return known.some((k) => msg.includes(k)) ? msg : "Request could not be processed";
}

function isAllowedRedirect(url: string): boolean {
  try {
    const parsed = new URL(url);
    const allowed = (Deno.env.get("ALLOWED_REDIRECT_ORIGINS") ?? "").split(",").map((s) => s.trim());
    if (allowed.length === 1 && allowed[0] === "") return false;
    return allowed.some((o) => parsed.origin === o);
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "Server configuration error" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const url = new URL(req.url);
    const path = url.pathname.replace("/auth-proxy", "");

    if (path === "/complete-forced-password-change" && req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
      if (!bearer) return json({ error: "Unauthorized" }, 401);
      const { data: authData, error: authError } = await supabase.auth.getUser(bearer);
      if (authError || !authData.user) return json({ error: "Unauthorized" }, 401);
      const { data: current, error: getError } = await supabase.auth.admin.getUserById(authData.user.id);
      if (getError || !current.user) return json({ error: "Unable to verify account" }, 400);
      const metadata = { ...(current.user.app_metadata ?? {}) };
      delete metadata.must_change_password;
      const { error: updateError } = await supabase.auth.admin.updateUserById(authData.user.id, { app_metadata: metadata });
      if (updateError) return json({ error: "Unable to complete password change" }, 400);
      return json({ ok: true });
    }


    // Super-admin account operations for the Expo admin app. All privileged
    // operations remain server-side; the client never receives the service key.
    async function requireAccountSuperAdmin(): Promise<string | null> {
      const authHeader = req.headers.get("Authorization");
      const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
      if (!bearer) return null;
      const { data: authData, error: authError } = await supabase.auth.getUser(bearer);
      if (authError || !authData.user) return null;
      const actorId = authData.user.id;
      const [{ data: allowed, error: roleError }, { data: assignment, error: staffError }] = await Promise.all([
        supabase.rpc("is_super_admin", { p_user_id: actorId }),
        supabase.from("staff_assignments").select("display_title").eq("user_id", actorId).maybeSingle(),
      ]);
      if (roleError || staffError || !allowed || assignment?.display_title === "Developer") return null;
      return actorId;
    }

    async function isProtectedAccount(targetId: string, actorId: string): Promise<boolean> {
      if (targetId === actorId) return true;
      const [roles, assignments, target] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", targetId),
        supabase.from("staff_assignments").select("user_id").eq("user_id", targetId),
        supabase.auth.admin.getUserById(targetId),
      ]);
      if (roles.error || assignments.error || target.error || !target.data?.user) return true;
      const protectedRoles = new Set(["super_admin", "admin", "support", "finance", "moderator"]);
      return (roles.data ?? []).some((row: { role: string }) => protectedRoles.has(row.role))
        || (assignments.data ?? []).length > 0;
    }

    async function auditAccountAction(actorId: string, action: string, targetId: string, details: Record<string, unknown>) {
      const { error } = await supabase.from("audit_logs").insert({
        user_id: actorId, action, target_type: "user", target_id: targetId, details,
      });
      return !error;
    }

    if (path === "/admin-list-users" && req.method === "POST") {
      const actorId = await requireAccountSuperAdmin();
      if (!actorId) return json({ error: "غير مصرّح: للمدير الأعلى فقط" }, 403);
      const body = await req.json().catch(() => ({}));
      const rawSearch = typeof body?.search === "string" ? body.search.trim().slice(0, 80) : "";
      let query = supabase.from("profiles")
        .select("id, full_name, phone, email, avatar_url")
        .order("full_name", { ascending: true })
        .limit(100);
      if (rawSearch) {
        const term = rawSearch.replace(/[%,()]/g, "").trim();
        if (term) query = query.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
      }
      const { data, error } = await query;
      if (error) return json({ error: "تعذر تحميل الحسابات" }, 400);
      return json({ users: data ?? [] });
    }

    if (path === "/admin-invite-user" && req.method === "POST") {
      const actorId = await requireAccountSuperAdmin();
      if (!actorId) return json({ error: "غير مصرّح: للمدير الأعلى فقط" }, 403);
      const body = await req.json().catch(() => ({}));
      const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";
      const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
        || fullName.length < 2 || fullName.length > 120 || (phone && (phone.length < 7 || phone.length > 30))) {
        return json({ error: "تحقق من الاسم والبريد ورقم الهاتف" }, 400);
      }
      const { data: invited, error } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName, ...(phone ? { phone } : {}) },
      });
      if (error || !invited.user) return json({ error: safeError(error?.message ?? "Invite failed") }, 400);
      const { error: metadataError } = await supabase.auth.admin.updateUserById(invited.user.id, {
        app_metadata: { ...(invited.user.app_metadata ?? {}), must_change_password: true },
      });
      if (metadataError) return json({ error: "أُرسلت الدعوة لكن تعذر فرض تغيير كلمة المرور؛ يلزم فحص الحساب" }, 500);
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: invited.user.id, full_name: fullName, phone, email,
      }, { onConflict: "id" });
      if (profileError) {
        await auditAccountAction(actorId, "auth_invite_profile_sync_failed", invited.user.id, { email });
        return json({ error: "أُرسلت الدعوة لكن تعذر إكمال الملف الشخصي؛ يلزم فحص الحساب" }, 500);
      }
      const auditLogged = await auditAccountAction(actorId, "auth_user_invited", invited.user.id, { email });
      return json({ ok: true, user_id: invited.user.id, audit_logged: auditLogged });
    }

    if (path === "/admin-update-user-contact" && req.method === "POST") {
      const actorId = await requireAccountSuperAdmin();
      if (!actorId) return json({ error: "غير مصرّح: للمدير الأعلى فقط" }, 403);
      const body = await req.json().catch(() => ({}));
      const userId = typeof body?.user_id === "string" ? body.user_id : "";
      const email = body?.email === undefined ? undefined : (typeof body.email === "string" ? body.email.trim().toLowerCase() : "");
      const phone = body?.phone === undefined ? undefined : (typeof body.phone === "string" ? body.phone.trim() : "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
        || (email === undefined && phone === undefined)
        || (email !== undefined && (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
        || (phone !== undefined && (!phone || phone.length < 7 || phone.length > 30))) {
        return json({ error: "بيانات الحساب غير صحيحة" }, 400);
      }
      if (await isProtectedAccount(userId, actorId)) return json({ error: "لا يمكن تعديل حسابك أو حسابات الإدارة والإشراف" }, 403);
      const authPatch: { email?: string; phone?: string } = {};
      if (email !== undefined) authPatch.email = email;
      if (phone !== undefined) authPatch.phone = phone;
      const { data: updated, error } = await supabase.auth.admin.updateUserById(userId, authPatch);
      if (error || !updated.user) return json({ error: safeError(error?.message ?? "Update failed") }, 400);
      const profilePatch: Record<string, string> = {};
      if (email !== undefined) profilePatch.email = email;
      if (phone !== undefined) profilePatch.phone = phone;
      const { error: profileError } = await supabase.from("profiles").update(profilePatch).eq("id", userId);
      if (profileError) {
        await auditAccountAction(actorId, "auth_contact_updated_profile_sync_failed", userId, { fields: Object.keys(profilePatch) });
        return json({ error: "تحدثت بيانات المصادقة لكن تعذرت مزامنة الملف الشخصي؛ يلزم فحص الحساب" }, 500);
      }
      const auditLogged = await auditAccountAction(actorId, "auth_contact_updated", userId, { fields: Object.keys(profilePatch) });
      return json({ ok: true, audit_logged: auditLogged });
    }

    if (path === "/admin-require-password-change" && req.method === "POST") {
      const actorId = await requireAccountSuperAdmin();
      if (!actorId) return json({ error: "غير مصرّح: للمدير الأعلى فقط" }, 403);
      const body = await req.json().catch(() => ({}));
      const userId = typeof body?.user_id === "string" ? body.user_id : "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
        || typeof body?.required !== "boolean") return json({ error: "بيانات الطلب غير صحيحة" }, 400);
      if (await isProtectedAccount(userId, actorId)) return json({ error: "لا يمكن تعديل حسابك أو حسابات الإدارة والإشراف" }, 403);
      const { data: target, error: getError } = await supabase.auth.admin.getUserById(userId);
      if (getError || !target.user) return json({ error: "تعذر التحقق من الحساب" }, 400);
      const metadata = { ...(target.user.app_metadata ?? {}), must_change_password: body.required };
      const { error } = await supabase.auth.admin.updateUserById(userId, { app_metadata: metadata });
      if (error) return json({ error: "تعذر تحديث حالة تغيير كلمة المرور" }, 400);
      const auditLogged = await auditAccountAction(actorId, body.required ? "password_change_required" : "password_change_requirement_removed", userId, {});
      return json({ ok: true, audit_logged: auditLogged });
    }

    if (path === "/signup" && req.method === "POST") {
      const body = await req.json();
      const email = typeof body?.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) ? body.email : null;
      const password = typeof body?.password === "string" && body.password.length >= 6 && body.password.length <= 128 ? body.password : null;
      const phone = typeof body?.phone === "string" && body.phone.trim().length >= 3 && body.phone.trim().length <= 255 ? body.phone.trim() : null;
      const full_name = typeof body?.full_name === "string" && body.full_name.trim().length >= 2 && body.full_name.trim().length <= 255 ? body.full_name.trim() : null;
      if (!email || !password || !phone || !full_name) return json({ error: "Invalid input" }, 400);

      const client = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      // Do not use the admin API to auto-confirm synthetic phone emails:
      // that would let anyone claim a phone number without proving ownership.
      if (email.endsWith("@mamnoon.app")) {
        return json({ error: "Phone verification is not configured. Register with a real email address until SMS verification is enabled." }, 503);
      }

      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { data: { full_name, phone } },
      });
      if (error) return json({ error: safeError(error.message) }, 400);
      if (data.user) {
        const { error: profileError } = await supabase.from("profiles").upsert({
          id: data.user.id,
          phone,
          full_name,
          email,
        });
        if (profileError) return json({ error: "Account created but profile setup failed" }, 500);
      }
      return json({ user: data.user, session: data.session });
    }

    if (path === "/login" && req.method === "POST") {
      const body = await req.json();
      const suppliedEmail = typeof body?.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)
        ? body.email.trim().toLowerCase()
        : null;
      const phone = typeof body?.phone === "string" && /^\+\d{8,15}$/.test(body.phone.trim())
        ? body.phone.trim()
        : null;
      const password = typeof body?.password === "string" && body.password.length >= 6 && body.password.length <= 128 ? body.password : null;
      if ((!suppliedEmail && !phone) || !password) return json({ error: "Invalid input" }, 400);

      let email = suppliedEmail;
      if (phone) {
        const { data: foundEmail, error: lookupError } = await supabase.rpc("lookup_email_by_phone", { _phone: phone });
        if (lookupError) return json({ error: safeError(lookupError.message) }, 400);
        const digits = phone.replace(/[^\d]/g, "");
        email = foundEmail ? String(foundEmail).toLowerCase() : `phone${digits}@mamnoon.app`;
      }

      const client = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await client.auth.signInWithPassword({ email: email!, password });
      if (error) return json({ error: safeError(error.message) }, 400);
      return json({ session: data.session, user: data.user });
    }

    if (path === "/reset-password" && req.method === "POST") {
      const body = await req.json();
      const email = typeof body?.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) ? body.email : null;
      const redirectTo = typeof body?.redirectTo === "string" ? body.redirectTo : null;
      if (!email || !redirectTo) return json({ error: "Invalid input" }, 400);
      if (!isAllowedRedirect(redirectTo)) return json({ error: "Invalid redirect URL" }, 400);

      const client = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) return json({ error: safeError(error.message) }, 400);
      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);
  } catch {
    return json({ error: "Internal error" }, 500);
  }
});
