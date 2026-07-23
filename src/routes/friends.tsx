import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/mobile-shell";
import { Search, UserPlus, Loader2, Users, Check, X, Phone, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/friends")({ ssr: false, component: FriendsPage });

interface FriendRow {
  friend_id: string;
  profiles: { full_name: string; phone: string } | null;
}

interface RequestRow {
  id: string;
  sender_id: string;
  status: string;
  sender_profile: { full_name: string; phone: string } | null;
}

function FriendsPage() {
  const { session, loading } = useAuth();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [pendingReqs, setPendingReqs] = useState<RequestRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    loadFriends();
    loadRequests();
  }, [session]);

  async function loadFriends() {
    const { data } = await supabase
      .from("friends")
      .select("friend_id, profiles:friend_id(full_name, phone)")
      .eq("user_id", session!.user.id);
    setFriends((data ?? []) as unknown as FriendRow[]);
  }

  async function loadRequests() {
    const { data } = await supabase
      .from("friend_requests")
      .select("id, sender_id, status, sender_profile:sender_id(full_name, phone)")
      .eq("receiver_id", session!.user.id)
      .eq("status", "pending");
    setPendingReqs((data ?? []) as unknown as RequestRow[]);
  }

  async function doSearch() {
    if (!search.trim()) return;
    setSearching(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, phone")
      .ilike("phone", `%${search.trim()}%`)
      .neq("id", session!.user.id)
      .limit(10);
    setResults(data ?? []);
    setSearching(false);
  }

  async function sendRequest(receiverId: string) {
    setBusy(receiverId);
    try {
      const { error } = await supabase.from("friend_requests").insert({
        sender_id: session!.user.id,
        receiver_id: receiverId,
      });
      if (error && !error.message.toLowerCase().includes("duplicate")) throw error;
      toast.success("تم إرسال طلب الصداقة");
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    } finally {
      setBusy(null);
    }
  }

  async function acceptRequest(reqId: string, senderId: string) {
    setBusy(reqId);
    try {
      await supabase.from("friend_requests").update({ status: "accepted" }).eq("id", reqId);
      await supabase.from("friends").insert([
        { user_id: session!.user.id, friend_id: senderId },
        { user_id: senderId, friend_id: session!.user.id },
      ]);
      toast.success("تم قبول الصديق");
      loadFriends();
      loadRequests();
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    } finally {
      setBusy(null);
    }
  }

  async function rejectRequest(reqId: string) {
    setBusy(reqId);
    try {
      await supabase.from("friend_requests").update({ status: "rejected" }).eq("id", reqId);
      loadRequests();
    } finally {
      setBusy(null);
    }
  }

  async function removeFriend(friendId: string) {
    setBusy(friendId);
    try {
      await supabase.from("friends").delete().eq("user_id", session!.user.id).eq("friend_id", friendId);
      await supabase.from("friends").delete().eq("user_id", friendId).eq("friend_id", session!.user.id);
      loadFriends();
      toast.success("تم حذف الصديق");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;

  return (
    <MobileShell>
      <div className="px-5 pt-10 pb-6">
        {/* Header with friends gradient */}
        <div className="flex items-center gap-3 mb-6 animate-pop-in">
          <div className="h-12 w-12 rounded-2xl grid place-items-center text-friends-foreground shadow-lg"
            style={{ background: "var(--gradient-friends)" }}>
            <Users className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-foreground">الأصدقاء</h1>
            <p className="text-xs text-muted-foreground">ابحث واضيف أصدقاء للتعاون</p>
          </div>
        </div>

        {/* Search */}
        <div className="glass rounded-2xl p-3 mb-4 animate-pop-in">
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 bg-input rounded-xl px-3 py-2.5">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doSearch()}
                placeholder="ابحث برقم الهاتف..."
                className="flex-1 bg-transparent text-sm font-medium outline-none text-foreground placeholder:text-muted-foreground"
                dir="ltr"
              />
            </div>
            <button
              onClick={doSearch}
              disabled={searching}
              className="h-11 w-11 rounded-xl grid place-items-center btn-press shrink-0 text-friends-foreground"
              style={{ background: "var(--gradient-friends)" }}
            >
              {searching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
            </button>
          </div>

          {results.length > 0 && (
            <div className="mt-3 space-y-2">
              {results.map((r) => (
                <div key={r.id} className="flex items-center gap-3 bg-surface-2 rounded-xl p-3">
                  <div className="h-10 w-10 rounded-xl grid place-items-center font-black text-sm text-friends-foreground"
                    style={{ background: "var(--gradient-friends)" }}>
                    {(r.full_name || "?").charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-foreground truncate">{r.full_name}</div>
                    <div className="text-xs text-muted-foreground" dir="ltr">{r.phone}</div>
                  </div>
                  <button
                    onClick={() => sendRequest(r.id)}
                    disabled={busy === r.id}
                    className="shrink-0 h-9 w-9 rounded-lg grid place-items-center btn-press text-friends-foreground"
                    style={{ background: "var(--gradient-friends)" }}
                  >
                    {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  </button>
                </div>
              ))}
            </div>
          )}

          {results.length === 0 && search.trim() && !searching && (
            <div className="mt-3 text-center text-sm text-muted-foreground py-4">
              لا توجد نتائج. تأكد من الرقم.
            </div>
          )}
        </div>

        {/* Pending requests */}
        {pendingReqs.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-black mb-2 text-foreground">طلبات الصداقة</h3>
            {pendingReqs.map((req) => (
              <div key={req.id} className="glass rounded-2xl p-3 mb-2 flex items-center gap-3 animate-pop-in">
                <div className="h-10 w-10 rounded-xl grid place-items-center font-black text-sm text-friends-foreground"
                  style={{ background: "var(--gradient-friends)" }}>
                  {(req.sender_profile?.full_name || "?").charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-foreground truncate">{req.sender_profile?.full_name}</div>
                  <div className="text-xs text-muted-foreground" dir="ltr">{req.sender_profile?.phone}</div>
                </div>
                <button
                  onClick={() => acceptRequest(req.id, req.sender_id)}
                  disabled={busy === req.id}
                  className="shrink-0 h-9 w-9 rounded-lg bg-emerald-500/20 text-emerald-600 grid place-items-center btn-press"
                >
                  {busy === req.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => rejectRequest(req.id)}
                  disabled={busy === req.id}
                  className="shrink-0 h-9 w-9 rounded-lg bg-destructive/20 text-destructive grid place-items-center btn-press"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Friends list */}
        <div>
          <h3 className="text-sm font-black mb-2 text-foreground">أصدقائك ({friends.length})</h3>
          {friends.length === 0 && (
            <div className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">
              لا يوجد أصدقاء بعد. ابحث واضيف!
            </div>
          )}
          {friends.map((f) => (
            <div key={f.friend_id} className="glass rounded-2xl p-3 mb-2 flex items-center gap-3 animate-pop-in">
              <div className="h-10 w-10 rounded-xl grid place-items-center font-black text-sm text-friends-foreground"
                style={{ background: "var(--gradient-friends)" }}>
                {(f.profiles?.full_name || "?").charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-foreground truncate">{f.profiles?.full_name}</div>
                <div className="text-xs text-muted-foreground" dir="ltr">{f.profiles?.phone}</div>
              </div>
              <button
                onClick={() => removeFriend(f.friend_id)}
                disabled={busy === f.friend_id}
                className="shrink-0 h-9 w-9 rounded-lg bg-destructive/20 text-destructive grid place-items-center btn-press"
              >
                {busy === f.friend_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </MobileShell>
  );
}
