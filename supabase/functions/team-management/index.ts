import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OWNER_EMAIL = "a7md0555666@gmail.com";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

type TeamRole = "developer" | "support" | "finance" | "operations" | "monitoring";
const ROLE_MAP: Record<TeamRole, { department: string; rank: string; display_title: string }> = {
  developer: { department: "operations", rank: "employee", display_title: "Developer" },
  support: { department: "customer_service", rank: "employee", display_title: "الدعم الفني" },
  finance: { department: "finance", rank: "employee", display_title: "المحاسبة" },
  operations: { department: "operations", rank: "employee", display_title: "العمليات" },
  monitoring: { department: "monitoring", rank: "supervisor", display_title: "المراقبة" },
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ROLE_MAP, value);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization");
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
      return json({ error: "إعدادات الخادم غير مكتملة" }, 500);
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    const actor = authData.user;
    if (authError || !actor || actor.email?.toLowerCase() !== OWNER_EMAIL) {
      return json({ error: "هذه الميزة متاحة لصاحب المشروع فقط" }, 403);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: ownerRole, error: ownerRoleError } = await admin
      .from("user_roles").select("role").eq("user_id", actor.id).eq("role", "super_admin").maybeSingle();
    if (ownerRoleError || !ownerRole) return json({ error: "تعذر التحقق من صلاحية المالك" }, 403);

    const body = await req.json();
    const action = body?.action;

    if (action === "list") {
      const { data: assignments, error } = await admin.from("staff_assignments")
        .select("user_id, rank, department, display_title, active, created_at, scope_type, scope_governorate")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (assignments ?? []).map((row) => row.user_id);
      const { data: profiles, error: profileError } = ids.length
        ? await admin.from("profiles").select("id, full_name, email, phone, avatar_url").in("id", ids)
        : { data: [], error: null };
      if (profileError) throw profileError;
      const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      return json({
        members: (assignments ?? []).map((row) => ({
          ...row,
          profile: profileMap.get(row.user_id) ?? null,
          is_owner: row.user_id === actor.id,
        })),
      });
    }

    if (action === "invite") {
      const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      const role = body?.role;
      if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || email.length > 254 || !isTeamRole(role)) {
        return json({ error: "يرجى إدخال بريد صحيح وصلاحية متاحة" }, 400);
      }
      if (email === OWNER_EMAIL) return json({ error: "حساب المالك لا يمكن تغييره" }, 400);

      const { data: existingProfile, error: profileLookupError } = await admin
        .from("profiles").select("id, email").ilike("email", email).maybeSingle();
      if (profileLookupError) throw profileLookupError;

      let targetUserId = existingProfile?.id as string | undefined;
      let invitationSent = false;
      if (!targetUserId) {
        const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email);
        if (inviteError || !inviteData.user) {
          return json({ error: inviteError?.message ?? "تعذر إرسال الدعوة. قد يكون الحساب مسجلاً مسبقاً." }, 400);
        }
        targetUserId = inviteData.user.id;
        invitationSent = true;
      }

      const roleConfig = ROLE_MAP[role];
      const { error: upsertError } = await admin.from("staff_assignments").upsert({
        user_id: targetUserId,
        rank: roleConfig.rank,
        department: roleConfig.department,
        display_title: roleConfig.display_title,
        active: true,
        assigned_by: actor.id,
        created_by: actor.id,
        scope_type: "global",
        scope_governorate: null,
      }, { onConflict: "user_id" });
      if (upsertError) throw upsertError;

      const { error: auditError } = await admin.rpc("log_admin_action", {
        p_action: invitationSent ? "staff_invited" : "staff_assigned",
        p_target_type: "staff",
        p_target_id: targetUserId,
        p_details: { email, role, department: roleConfig.department, invitation_sent: invitationSent },
      });
      return json({ ok: true, user_id: targetUserId, invitation_sent: invitationSent, audit_logged: !auditError });
    }

    if (action === "update") {
      const targetUserId = typeof body?.user_id === "string" ? body.user_id : "";
      const role = body?.role;
      if (!targetUserId || !isTeamRole(role)) return json({ error: "بيانات التعديل غير صحيحة" }, 400);
      if (targetUserId === actor.id) return json({ error: "لا يمكن تعديل صلاحيات المالك" }, 400);
      const { data: target, error: targetError } = await admin.auth.admin.getUserById(targetUserId);
      if (targetError || !target.user || target.user.email?.toLowerCase() === OWNER_EMAIL) {
        return json({ error: "هذا الحساب محمي ولا يمكن تعديله" }, 403);
      }
      const { data: targetRoles, error: rolesError } = await admin.from("user_roles")
        .select("role").eq("user_id", targetUserId).eq("role", "super_admin");
      if (rolesError) throw rolesError;
      if ((targetRoles ?? []).length) return json({ error: "لا يمكن تعديل حساب مدير أعلى" }, 403);

      const roleConfig = ROLE_MAP[role];
      const { error } = await admin.from("staff_assignments").update({
        rank: roleConfig.rank,
        department: roleConfig.department,
        display_title: roleConfig.display_title,
        active: true,
        updated_at: new Date().toISOString(),
      }).eq("user_id", targetUserId);
      if (error) throw error;
      const { error: auditError } = await admin.rpc("log_admin_action", {
        p_action: "staff_role_updated", p_target_type: "staff", p_target_id: targetUserId,
        p_details: { role, department: roleConfig.department },
      });
      return json({ ok: true, audit_logged: !auditError });
    }

    if (action === "deactivate") {
      const targetUserId = typeof body?.user_id === "string" ? body.user_id : "";
      if (!targetUserId || targetUserId === actor.id) return json({ error: "لا يمكن إيقاف حساب المالك" }, 400);
      const { data: target, error: targetError } = await admin.auth.admin.getUserById(targetUserId);
      if (targetError || !target.user || target.user.email?.toLowerCase() === OWNER_EMAIL) {
        return json({ error: "هذا الحساب محمي ولا يمكن إيقافه" }, 403);
      }
      const { data: targetRoles, error: rolesError } = await admin.from("user_roles")
        .select("role").eq("user_id", targetUserId).eq("role", "super_admin");
      if (rolesError) throw rolesError;
      if ((targetRoles ?? []).length) return json({ error: "لا يمكن إيقاف حساب مدير أعلى" }, 403);
      const { error } = await admin.from("staff_assignments")
        .update({ active: false, updated_at: new Date().toISOString() }).eq("user_id", targetUserId);
      if (error) throw error;
      const { error: auditError } = await admin.rpc("log_admin_action", {
        p_action: "staff_deactivated", p_target_type: "staff", p_target_id: targetUserId,
        p_details: { active: false },
      });
      return json({ ok: true, audit_logged: !auditError });
    }

    return json({ error: "إجراء غير معروف" }, 400);
  } catch (error) {
    console.error("[team-management]", error);
    return json({ error: "تعذر تنفيذ العملية. حاول مرة أخرى." }, 500);
  }
});
