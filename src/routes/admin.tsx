import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  Loader2, ShieldCheck, Users, Car, ListChecks, Wallet, Crown, Activity,
  LayoutDashboard, Tag, MessageSquare, UserCheck, Flag, Bell, ScrollText,
  Map, ChevronLeft, Settings, AlertCircle,
} from "lucide-react";
import {
  adminAdjustWallet, adminBlockUser, adminBroadcastNotification, adminCancelRequest,
  adminDeleteCoupon, adminDeleteFriendRequest, adminDeleteFriendship, adminDeleteMessage,
  adminGetDashboardStats, adminGetLiveLocations, adminGetLiveRequests, adminGetUserDetail, adminGetUserRoles,
  adminGrantRole, adminListAuditLogs, adminListChats, adminListCoupons, adminListFriendRequests, getStaffRoles,
  adminListFriends, adminListMessages, adminListProviders, adminListReports, adminListRequests,
  adminListTransactions, adminListUsers, adminReopenRequest, adminResolveReport, adminRevokeRole,
  adminSaveCoupon, adminSearchUsers, adminSetProviderStatus, adminUnblockUser,
} from "@/lib/admin.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/admin")({ ssr: false,
  head: () => ({ meta: [
    { title: "إدارة ممنون | ممنون" },
    { name: "description", content: "إدارة مستخدمي وطلبات منصة ممنون." },
    { property: "og:title", content: "إدارة ممنون | ممنون" },
    { property: "og:description", content: "إدارة مستخدمي وطلبات منصة ممنون." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }), component: AdminPage });

type Section = "overview" | "users" | "providers" | "requests" | "chat" | "friends" | "reports" | "subscriptions" | "coupons" | "wallet" | "stats" | "map" | "notifications" | "audit" | "roles";

const NAV_ITEMS: { key: Section; label: string; icon: any; roles: string[] }[] = [
  { key: "overview", label: "نظرة عامة", icon: LayoutDashboard, roles: ["super_admin", "admin", "support", "finance", "moderator"] },
  { key: "stats", label: "الإحصائيات", icon: Activity, roles: ["super_admin", "admin", "finance"] },
  { key: "users", label: "المستخدمون", icon: Users, roles: ["super_admin", "admin", "support", "moderator"] },
  { key: "providers", label: "السائقون والفنيون", icon: Car, roles: ["super_admin", "admin", "support"] },
  { key: "requests", label: "الطلبات", icon: ListChecks, roles: ["super_admin", "admin", "support"] },
  { key: "chat", label: "الدردشة", icon: MessageSquare, roles: ["super_admin", "admin", "moderator"] },
  { key: "friends", label: "الأصدقاء", icon: UserCheck, roles: ["super_admin", "admin", "moderator"] },
  { key: "reports", label: "البلاغات", icon: Flag, roles: ["super_admin", "admin", "support", "moderator"] },
  { key: "subscriptions", label: "الاشتراكات", icon: Crown, roles: ["super_admin", "admin", "finance"] },
  { key: "coupons", label: "الكوبونات", icon: Tag, roles: ["super_admin", "admin", "finance"] },
  { key: "wallet", label: "المحفظة", icon: Wallet, roles: ["super_admin", "admin", "finance"] },
  { key: "map", label: "الخريطة المباشرة", icon: Map, roles: ["super_admin", "admin", "support"] },
  { key: "notifications", label: "الإشعارات", icon: Bell, roles: ["super_admin", "admin", "support", "finance", "moderator"] },
  { key: "roles", label: "الصلاحيات", icon: Settings, roles: ["super_admin"] },
  { key: "audit", label: "سجل العمليات", icon: ScrollText, roles: ["super_admin", "admin"] },
];

function AdminPage() {
  const { session, loading } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [staffRoles, setStaffRoles] = useState<string[]>([]);
  const [section, setSection] = useState<Section>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const getStaffRolesFn = useServerFn(getStaffRoles);

  useEffect(() => {
    if (!session || loading) return;
    void getStaffRolesFn({ data: {} })
      .then((roles) => {
        setStaffRoles(roles as string[]);
        setAuthorized(true);
      })
      .catch((error: unknown) => {
        console.error("[admin] staff authorization failed", error);
        setAuthorized(false);
      });
  }, [session, loading, getStaffRolesFn]);
