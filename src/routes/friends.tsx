import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/mobile-shell";
import { Search, UserPlus, Loader2, Users, Check, X, Phone, ChevronLeft } from "lucide-react";
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

    const ch = supabase
      .channel(`friend-reqs-${session.user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "friend_requests", filter: `receiver_id=eq.${session.user.id}` },
        () => {
          loadRequests();
          toast.success("لديك طلب صداقة جديد!");
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "friends", filter: `user_id=eq.${session.user.id}` },
        () => loadFriends()
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [session]);

  async function loadFriends() {
    const { data } = await supabase
      .from("friends")
      .select("friend_id, profiles!friends_friend_id_fkey(full_name, phone)")
      .eq("user_id", session!.user.id);
    setFriends((data as any) ?? []);
  }

  async function loadRequests() {
    const { data } = await supabase
      .from("friend_requests")
      .select("id, sender_id, status, profiles!friend_requests_sender_id_fkey(full_name, phone)")
      .eq("receiver_id", session!.user.id)
      .eq("status", "pending");
    setPendingReqs((data as any) ?? []);
  }

  async function doSearch() {
    if (!search.trim()) { setResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, phone")
      .or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`)
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
        status: "pending",
      });
      if (error) throw error;
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
      const { error: err1 } = await supabase.from("friends").insert({
        user_id: session!.user.id,
        friend_id: senderId,
      });
      if (err1) throw err1;
      const { error: err2 } = await supabase.from("friends").insert({
        user_id: senderId,
        friend_id: session!.user.id,
      });
      if (err2) throw err2;
      const { error: err3 } = await supabase
        .from("friend_requests")
        .update({ status: "accepted" })
        .eq("id", reqId);
      if (err3) throw err3;
      toast.success("تم قبول طلب الصداقة");
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
      const { error } = await supabase
        .from("friend_requests")
        .update({ status: "rejected" })
        .eq("id", reqId);
      if (error) throw error;
      loadRequests();
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;

  return (
    <MobileShell>
      <div className="flex items-center gap-3 mb-4">
        <Link to="/home" className="glass rounded-xl p-2">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-black">الأصدقاء</h1>
      </div>
      <div className="space-y-4">
        <div className="glass rounded-2xl p-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); }}
              onKeyUp={doSearch}
              placeholder="ابحث بالاسم أو رقم الهاتف..."
              className="flex-1 bg-transparent outline-none text-sm"
            />
            {searching && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
        </div>

        {results.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-bold text-muted-foreground px-2">نتائج البحث</div>
            {results.map((r) => (
              <div key={r.id} className="glass rounded-2xl p-3 flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm">{r.full_name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {r.phone}
                  </div>
                </div>
                <button
                  onClick={() => sendRequest(r.id)}
                  disabled={busy === r.id}
                  className="glass rounded-xl px-3 py-2 text-xs font-bold text-primary flex items-center gap-1"
                >
                  {busy === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                  إضافة
                </button>
              </div>
            ))}
          </div>
        )}

        {pendingReqs.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-bold text-muted-foreground px-2">طلبات الصداقة</div>
            {pendingReqs.map((req) => (
              <div key={req.id} className="glass rounded-2xl p-3 flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm">{req.sender_profile?.full_name ?? "غير معروف"}</div>
                  <div className="text-xs text-muted-foreground">{req.sender_profile?.phone}</div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => acceptRequest(req.id, req.sender_id)}
                    disabled={busy === req.id}
                    className="rounded-xl p-2 bg-emerald-500/10 text-emerald-600"
                  >
                    {busy === req.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => rejectRequest(req.id)}
                    disabled={busy === req.id}
                    className="rounded-xl p-2 bg-red-500/10 text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <div className="text-xs font-bold text-muted-foreground px-2">أصدقاؤك ({friends.length})</div>
          {friends.length === 0 ? (
            <div className="glass rounded-2xl p-8 text-center">
              <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <div className="text-sm text-muted-foreground">لا يوجد أصدقاء بعد — ابحث وأضف أصدقاء!</div>
            </div>
          ) : (
            friends.map((f) => (
              <div key={f.friend_id} className="glass rounded-2xl p-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary-glow grid place-items-center text-white font-bold">
                  {(f.profiles?.full_name ?? "?").charAt(0)}
                </div>
                <div>
                  <div className="font-bold text-sm">{f.profiles?.full_name ?? "غير معروف"}</div>
                  <div className="text-xs text-muted-foreground">{f.profiles?.phone}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </MobileShell>
  );
}
