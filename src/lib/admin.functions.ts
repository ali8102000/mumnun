import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type AdminContext = { supabase: SupabaseClient<Database>; userId: string };
type AdminRow = {
  id: string;
  user_id: string;
  friend_id: string;
  role: string;
  type: string;
  status: string;
  amount: number;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
};
type AdminQueryResult<T> = { data: T | null; error: { message: string } | null; count: number | null };
type AdminSingle<T> = T extends Array<infer Row> ? Row | null : T | null;
interface AdminQuery<T> extends PromiseLike<AdminQueryResult<T>> {
  select(columns?: string, options?: { count?: "exact"; head?: boolean }): AdminQuery<T>;
  eq(column: string, value: unknown): AdminQuery<T>;
  or(filters: string): AdminQuery<T>;
  order(column: string, options?: { ascending?: boolean }): AdminQuery<T>;
  limit(count: number): AdminQuery<T>;
  range(from: number, to: number): AdminQuery<T>;
  in(column: string, values: readonly unknown[]): AdminQuery<T>;
  gte(column: string, value: string): AdminQuery<T>;
  maybeSingle(): Promise<AdminQueryResult<AdminSingle<T>>>;
}
type AdminQueryClient = { from(table: string): AdminQuery<AdminRow[]> };
type AdminRpcArgs = {
  has_staff_role: { p_user_id: string };
  has_admin_access: { p_user_id: string };
  is_super_admin: { p_user_id: string };
  bootstrap_first_super_admin: { p_user_id: string };
  admin_grant_role: { p_target_user: string; p_role: string };
  admin_revoke_role: { p_target_user: string; p_role: string };
  get_staff_roles: { p_user_id: string };
  admin_block_user: { p_user_id: string; p_reason: string | null; p_expires_at: string | null };
  admin_unblock_user: { p_user_id: string };
  admin_set_provider_status: { p_user_id: string; p_type: string; p_status: string };
  admin_cancel_request: { p_request_id: string; p_reason: string | null };
  admin_reopen_request: { p_request_id: string };
  admin_adjust_wallet: { p_user_id: string; p_amount: number; p_note: string | null; p_type: string };
  admin_save_coupon: { p_id: string | null; p_code: string; p_type: string; p_value: number; p_max_uses: number; p_expires_at: string | null; p_active: boolean; p_min_amount: number };
  admin_delete_coupon: { p_coupon_id: string };
  admin_resolve_report: { p_report_id: string; p_status: string; p_note: string | null };
  admin_delete_friendship: { p_user1_id: string; p_user2_id: string };
  admin_delete_friend_request: { p_request_id: string };
  admin_delete_message: { p_message_id: string };
  admin_broadcast_notification: { p_target: string; p_title: string; p_body: string; p_single_user_id: string | null };
};
type AdminRpcName = keyof AdminRpcArgs;
type AdminRpcClient = {
  rpc<Name extends AdminRpcName>(name: Name, args: AdminRpcArgs[Name]): Promise<{ data: unknown; error: { message: string } | null }>;
};
const adminQueries = (client: unknown): AdminQueryClient => client as AdminQueryClient;
const adminRpc = (client: unknown): AdminRpcClient => client as AdminRpcClient;

async function requireStaff(context: AdminContext) {
  const { supabase, userId } = context;
  const { data } = await adminRpc(supabase).rpc("has_staff_role", { p_user_id: userId });
  if (!data) throw new Error("غير مصرّح: للمشرفين فقط");
}

async function requireAdmin(context: AdminContext) {
  const { supabase, userId } = context;
  const { data } = await adminRpc(supabase).rpc("has_admin_access", { p_user_id: userId });
  if (!data) throw new Error("غير مصرّح: للمديرين فقط");
}

async function requireSuperAdmin(context: AdminContext) {
  const { supabase, userId } = context;
  const { data } = await adminRpc(supabase).rpc("is_super_admin", { p_user_id: userId });
  if (!data) throw new Error("غير مصرّح: للمدير الأعلى فقط");
}

export const checkSuperAdminExists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await adminQueries(supabaseAdmin).from("user_roles").select("*", { count: "exact", head: true }).eq("role", "super_admin");
    return { exists: (count ?? 0) > 0 };
  });

export const bootstrapSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await adminRpc(supabase).rpc("bootstrap_first_super_admin", { p_user_id: userId });
    if (error) throw new Error("فشل إنشاء المدير الأعلى: " + error.message);
    if (!data) throw new Error("يوجد مدير أعلى بالفعل");
    return { ok: true };
  });

export const adminGrantRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ target_user_id: z.string().uuid(), role: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);
    const { supabase } = context;
    const { error } = await adminRpc(supabase).rpc("admin_grant_role", { p_target_user: data.target_user_id, p_role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminRevokeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ target_user_id: z.string().uuid(), role: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);
    const { supabase } = context;
    const { error } = await adminRpc(supabase).rpc("admin_revoke_role", { p_target_user: data.target_user_id, p_role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getStaffRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabase } = context;
    const targetId = data?.user_id ?? context.userId;
    const { data: roles, error } = await adminRpc(supabase).rpc("get_staff_roles", { p_user_id: targetId });
    if (error) throw new Error(error.message);
    return Array.isArray(roles) ? roles.filter((role): role is string => typeof role === "string") : [];
  });

export const adminSearchUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ query: z.string().min(1).max(100), limit: z.number().int().min(1).max(100).default(50) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: users, error } = await adminQueries(supabaseAdmin).from("profiles").select("id, phone, full_name, email, created_at, avatar_url").or(`phone.ilike.%${data.query}%,full_name.ilike.%${data.query}%,email.ilike.%${data.query}%`).order("created_at", { ascending: false }).limit(data.limit);
    if (error) throw new Error("فشل البحث");
    return users ?? [];
  });

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ page: z.number().int().min(1).default(1), limit: z.number().int().min(1).max(100).default(50) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const offset = (data.page - 1) * data.limit;
    const [usersRes, blocksRes] = await Promise.all([
      adminQueries(supabaseAdmin).from("profiles").select("id, phone, full_name, email, created_at, avatar_url", { count: "exact" }).order("created_at", { ascending: false }).range(offset, offset + data.limit - 1),
      adminQueries(supabaseAdmin).from("user_blocks").select("user_id, reason, expires_at, blocked_at"),
    ]);
    if (usersRes.error) throw new Error("فشل تحميل المستخدمين");
    const blockedMap = new Map<string, AdminRow>();
    for (const b of blocksRes.data ?? []) blockedMap.set(b.user_id, b);
    return { users: (usersRes.data ?? []).map((u: AdminRow) => ({ ...u, blocked: blockedMap.get(u.id) ?? null })), total: usersRes.count ?? 0 };
  });

export const adminBlockUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid(), reason: z.string().max(500).optional(), expires_at: z.string().datetime().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabase } = context;
    const { error } = await adminRpc(supabase).rpc("admin_block_user", { p_user_id: data.user_id, p_reason: data.reason ?? null, p_expires_at: data.expires_at ?? null });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUnblockUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabase } = context;
    const { error } = await adminRpc(supabase).rpc("admin_unblock_user", { p_user_id: data.user_id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminGetUserDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [profileRes, rolesRes, blocksRes, driverRes, workerRes, txRes, reqRes] = await Promise.all([
      adminQueries(supabaseAdmin).from("profiles").select("*").eq("id", data.user_id).maybeSingle(),
      adminQueries(supabaseAdmin).from("user_roles").select("role, created_at").eq("user_id", data.user_id),
      adminQueries(supabaseAdmin).from("user_blocks").select("*").eq("user_id", data.user_id).maybeSingle(),
      adminQueries(supabaseAdmin).from("driver_profiles").select("*").eq("user_id", data.user_id).maybeSingle(),
      adminQueries(supabaseAdmin).from("worker_profiles").select("*").eq("user_id", data.user_id).maybeSingle(),
      adminQueries(supabaseAdmin).from("transactions").select("*").eq("user_id", data.user_id).order("created_at", { ascending: false }).limit(20),
      adminQueries(supabaseAdmin).from("service_requests").select("id, type, status, created_at, price_estimate").or(`customer_id.eq.${data.user_id},provider_id.eq.${data.user_id}`).order("created_at", { ascending: false }).limit(20),
    ]);
    return { profile: profileRes.data, roles: rolesRes.data ?? [], block: blocksRes.data, driverProfile: driverRes.data, workerProfile: workerRes.data, transactions: txRes.data ?? [], requests: reqRes.data ?? [] };
  });

export const adminListProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ type: z.enum(["driver", "worker"]).default("driver") }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const table = data.type === "driver" ? "driver_profiles" : "worker_profiles";
    const { data: providers, error } = await adminQueries(supabaseAdmin)
      .from(table)
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("فشل تحميل المزودين");

    const providerIds = (providers ?? []).map((provider: AdminRow) => provider.user_id);
    if (providerIds.length === 0) return [];
    const { data: profiles, error: profilesError } = await adminQueries(supabaseAdmin)
      .from("profiles")
      .select("id, full_name, phone, email")
      .in("id", providerIds);
    if (profilesError) throw new Error("فشل تحميل بيانات المزودين");

    const profilesById = new Map((profiles ?? []).map((profile: AdminRow) => [profile.id, profile]));
    return (providers ?? []).map((provider: AdminRow) => ({
      ...provider,
      profiles: profilesById.get(provider.user_id) ?? null,
    }));
  });

export const adminSetProviderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid(), type: z.enum(["driver", "worker"]), status: z.enum(["approved", "suspended", "rejected"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabase } = context;
    const { error } = await adminRpc(supabase).rpc("admin_set_provider_status", { p_user_id: data.user_id, p_type: data.type, p_status: data.status });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ status: z.string().optional(), limit: z.number().int().min(1).max(200).default(50) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = adminQueries(supabaseAdmin).from("service_requests").select("id, type, status, price_estimate, created_at, pickup_text, dest_text, customer_id, provider_id").order("created_at", { ascending: false }).limit(data.limit);
    if (data.status && data.status !== "all") query = query.eq("status", data.status);
    const { data: requests, error } = await query;
    if (error) throw new Error("فشل تحميل الطلبات");
    return requests ?? [];
  });

export const adminCancelRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ request_id: z.string().uuid(), reason: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabase } = context;
    const { error } = await adminRpc(supabase).rpc("admin_cancel_request", { p_request_id: data.request_id, p_reason: data.reason ?? null });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminReopenRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ request_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabase } = context;
    const { error } = await adminRpc(supabase).rpc("admin_reopen_request", { p_request_id: data.request_id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminAdjustWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid(), amount: z.number(), note: z.string().max(500).optional(), type: z.enum(["credit", "debit"]).default("credit") }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabase } = context;
    const { error } = await adminRpc(supabase).rpc("admin_adjust_wallet", { p_user_id: data.user_id, p_amount: data.amount, p_note: data.note ?? null, p_type: data.type });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ limit: z.number().int().min(1).max(200).default(100) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: txs, error } = await adminQueries(supabaseAdmin).from("transactions").select("*, profiles!inner(full_name, phone)").order("created_at", { ascending: false }).limit(data.limit);
    if (error) throw new Error("فشل تحميل المعاملات");
    return txs ?? [];
  });

export const adminListCoupons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: coupons, error } = await adminQueries(supabaseAdmin).from("coupons").select("*").order("created_at", { ascending: false });
    if (error) throw new Error("فشل تحميل الكوبونات");
    return coupons ?? [];
  });

export const adminSaveCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid().optional(), code: z.string().min(2).max(50), type: z.enum(["percentage", "fixed"]).default("percentage"), value: z.number().min(0), max_uses: z.number().int().min(1).default(1000), expires_at: z.string().datetime().optional().nullable(), active: z.boolean().default(true), min_amount: z.number().min(0).default(0) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabase } = context;
    const { error } = await adminRpc(supabase).rpc("admin_save_coupon", { p_id: data.id ?? null, p_code: data.code, p_type: data.type, p_value: data.value, p_max_uses: data.max_uses, p_expires_at: data.expires_at ?? null, p_active: data.active, p_min_amount: data.min_amount });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ coupon_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabase } = context;
    const { error } = await adminRpc(supabase).rpc("admin_delete_coupon", { p_coupon_id: data.coupon_id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ status: z.string().optional(), limit: z.number().int().min(1).max(100).default(50) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = adminQueries(supabaseAdmin).from("user_reports").select("*, reporter:profiles!user_reports_reporter_id_fkey(full_name, phone), reported:profiles!user_reports_reported_id_fkey(full_name, phone)").order("created_at", { ascending: false }).limit(data.limit);
    if (data.status && data.status !== "all") query = query.eq("status", data.status);
    const { data: reports, error } = await query;
    if (error) throw new Error("فشل تحميل البلاغات");
    return reports ?? [];
  });

export const adminResolveReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ report_id: z.string().uuid(), status: z.enum(["resolved", "closed", "dismissed"]), note: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabase } = context;
    const { error } = await adminRpc(supabase).rpc("admin_resolve_report", { p_report_id: data.report_id, p_status: data.status, p_note: data.note ?? null });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListFriends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ limit: z.number().int().min(1).max(200).default(100) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: friends, error } = await adminQueries(supabaseAdmin).from("friends").select("*, user:profiles!friends_user_id_fkey(full_name, phone), friend:profiles!friends_friend_id_fkey(full_name, phone)").order("created_at", { ascending: false }).limit(data.limit);
    if (error) throw new Error("فشل تحميل الأصدقاء");
    return friends ?? [];
  });

export const adminListFriendRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ limit: z.number().int().min(1).max(200).default(100) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: reqs, error } = await adminQueries(supabaseAdmin).from("friend_requests").select("*, sender:profiles!friend_requests_sender_id_fkey(full_name, phone), receiver:profiles!friend_requests_receiver_id_fkey(full_name, phone)").order("created_at", { ascending: false }).limit(data.limit);
    if (error) throw new Error("فشل تحميل طلبات الصداقة");
    return reqs ?? [];
  });

export const adminDeleteFriendship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user1_id: z.string().uuid(), user2_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabase } = context;
    const { error } = await adminRpc(supabase).rpc("admin_delete_friendship", { p_user1_id: data.user1_id, p_user2_id: data.user2_id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteFriendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ request_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabase } = context;
    const { error } = await adminRpc(supabase).rpc("admin_delete_friend_request", { p_request_id: data.request_id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ chat_id: z.string().uuid().optional(), limit: z.number().int().min(1).max(200).default(100) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = adminQueries(supabaseAdmin).from("messages").select("*, sender:profiles!messages_sender_id_fkey(full_name, phone), chat:chats(id)").order("created_at", { ascending: false }).limit(data.limit);
    if (data.chat_id) query = query.eq("chat_id", data.chat_id);
    const { data: messages, error } = await query;
    if (error) throw new Error("فشل تحميل الرسائل");
    return messages ?? [];
  });

export const adminDeleteMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ message_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabase } = context;
    const { error } = await adminRpc(supabase).rpc("admin_delete_message", { p_message_id: data.message_id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListChats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ limit: z.number().int().min(1).max(200).default(100) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: chats, error } = await adminQueries(supabaseAdmin).from("chats").select("*, participant1:profiles!chats_participant1_id_fkey(full_name, phone), participant2:profiles!chats_participant2_id_fkey(full_name, phone)").order("updated_at", { ascending: false }).limit(data.limit);
    if (error) throw new Error("فشل تحميل المحادثات");
    return chats ?? [];
  });

export const adminBroadcastNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ target: z.enum(["all", "drivers", "workers", "single"]), title: z.string().min(1).max(200), body: z.string().min(1).max(2000), user_id: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabase } = context;
    const { data: count, error } = await adminRpc(supabase).rpc("admin_broadcast_notification", { p_target: data.target, p_title: data.title, p_body: data.body, p_single_user_id: data.user_id ?? null });
    if (error) throw new Error(error.message);
    return { sent: typeof count === "number" ? count : Number(count ?? 0) };
  });

export const adminListAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ limit: z.number().int().min(1).max(200).default(100) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: logs, error } = await adminQueries(supabaseAdmin).from("audit_logs").select("*, admin:profiles!audit_logs_user_id_fkey(full_name, phone)").order("created_at", { ascending: false }).limit(data.limit);
    if (error) throw new Error("فشل تحميل السجل");
    return logs ?? [];
  });

export const adminGetDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [usersRes, driversRes, workersRes, activeDriversRes, activeWorkersRes, reqAllRes, reqActiveRes, reqDoneRes, reqCancelledRes, todayTxRes, monthTxRes, yearTxRes] = await Promise.all([
      adminQueries(supabaseAdmin).from("profiles").select("id", { count: "exact", head: true }),
      adminQueries(supabaseAdmin).from("driver_profiles").select("id", { count: "exact", head: true }),
      adminQueries(supabaseAdmin).from("worker_profiles").select("id", { count: "exact", head: true }),
      adminQueries(supabaseAdmin).from("driver_profiles").select("id", { count: "exact", head: true }).eq("available", true),
      adminQueries(supabaseAdmin).from("worker_profiles").select("id", { count: "exact", head: true }).eq("available", true),
      adminQueries(supabaseAdmin).from("service_requests").select("id", { count: "exact", head: true }),
      adminQueries(supabaseAdmin).from("service_requests").select("id", { count: "exact", head: true }).in("status", ["pending", "searching", "accepted", "in_progress"]),
      adminQueries(supabaseAdmin).from("service_requests").select("id", { count: "exact", head: true }).eq("status", "completed"),
      adminQueries(supabaseAdmin).from("service_requests").select("id", { count: "exact", head: true }).eq("status", "cancelled"),
      adminQueries(supabaseAdmin).from("transactions").select("amount, type").gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
      adminQueries(supabaseAdmin).from("transactions").select("amount, type").gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      adminQueries(supabaseAdmin).from("transactions").select("amount, type").gte("created_at", new Date(new Date().getFullYear(), 0, 1).toISOString()),
    ]);
    function sumCredit(rows: AdminRow[]) { return (rows ?? []).filter((r) => r.type === "credit").reduce((s, r) => s + Number(r.amount), 0); }
    return { totalUsers: usersRes.count ?? 0, totalDrivers: driversRes.count ?? 0, totalWorkers: workersRes.count ?? 0, activeDrivers: activeDriversRes.count ?? 0, activeWorkers: activeWorkersRes.count ?? 0, totalRequests: reqAllRes.count ?? 0, activeRequests: reqActiveRes.count ?? 0, completedRequests: reqDoneRes.count ?? 0, cancelledRequests: reqCancelledRes.count ?? 0, dailyRevenue: sumCredit(todayTxRes.data), monthlyRevenue: sumCredit(monthTxRes.data), yearlyRevenue: sumCredit(yearTxRes.data) };
  });

export const adminGetLiveLocations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: locations, error } = await adminQueries(supabaseAdmin).from("live_locations").select("*, profile:profiles!live_locations_user_id_fkey(full_name, phone)").order("updated_at", { ascending: false }).limit(500);
    if (error) throw new Error("فشل تحميل المواقع");
    return locations ?? [];
  });

export const adminGetLiveRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: requests, error } = await adminQueries(supabaseAdmin).from("service_requests").select("id, type, status, pickup_lat, pickup_lng, dest_lat, dest_lng, pickup_text, dest_text, created_at").in("status", ["pending", "searching", "accepted", "in_progress"]).order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error("فشل تحميل الطلبات");
    return requests ?? [];
  });


export const adminListMonitoringBlocks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await adminQueries(supabaseAdmin)
      .from("user_blocks")
      .select("*, profiles!user_blocks_user_id_fkey(full_name)")
      .order("blocked_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("فشل تحميل قائمة الحظر");
    return data ?? [];
  });

export const adminListMonitoringTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await adminQueries(supabaseAdmin)
      .from("support_tickets")
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("فشل تحميل تذاكر الدعم");
    return data ?? [];
  });


export const adminGetUserRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles, error } = await adminQueries(supabaseAdmin)
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user_id);
    if (error) throw new Error("فشل تحميل صلاحيات المستخدم");
    return (roles ?? []).map((row: { role: string }) => row.role);
  });
