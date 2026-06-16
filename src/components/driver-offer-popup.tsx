import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { respondToOffer } from "@/lib/dispatch.functions";
import { MapPin, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Offer = {
  id: string;
  request_id: string;
  distance_km: number | null;
  expires_at: string;
  status: string;
};

/**
 * Listens for incoming offers when the signed-in user is a driver,
 * shows a 20s countdown popup and dispatches accept/reject to the server.
 */
export function DriverOfferPopup() {
  const { session, roles } = useAuth();
  const navigate = useNavigate();
  const respond = useServerFn(respondToOffer);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [request, setRequest] = useState<any>(null);
  const [secondsLeft, setSecondsLeft] = useState(20);
  const [busy, setBusy] = useState(false);
  const uid = session?.user.id;
  const isDriver = roles.includes("driver");

  // Subscribe to new offers for this driver
  useEffect(() => {
    if (!uid || !isDriver) return;
    const ch = supabase
      .channel(`offers-${uid}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "request_offers",
          filter: `provider_id=eq.${uid}`,
        },
        async (payload: any) => {
          const o = payload.new as Offer;
          if (o.status !== "pending") return;
          if (offer) return; // already showing one
          // Load request details
          const { data: r } = await supabase
            .from("service_requests")
            .select("*")
            .eq("id", o.request_id)
            .single();
          setRequest(r);
          setOffer(o);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [uid, isDriver, offer]);

  // Countdown
  useEffect(() => {
    if (!offer) return;
    const expiresAt = new Date(offer.expires_at).getTime();
    const tick = () => {
      const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) setOffer(null);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [offer]);

  async function doRespond(action: "accept" | "reject") {
    if (!offer) return;
    setBusy(true);
    try {
      const res: any = await respond({ data: { offerId: offer.id, action } });
      if (action === "accept" && res?.accepted) {
        toast.success("تم قبول الطلب");
        navigate({ to: "/request/$id", params: { id: res.requestId } });
      } else if (action === "reject") {
        toast("تم تجاهل الطلب");
      }
      setOffer(null);
      setRequest(null);
    } catch (e: any) {
      toast.error(e.message ?? "تعذّر تنفيذ العملية");
      setOffer(null);
    } finally {
      setBusy(false);
    }
  }

  if (!offer || !request) return null;

  const pct = (secondsLeft / 20) * 100;

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm grid place-items-center p-4 animate-in fade-in">
      <div className="w-full max-w-sm bg-background rounded-3xl p-6 shadow-elegant border border-border">
        <div className="text-center mb-4">
          <div className="text-xs font-bold text-muted-foreground mb-1">طلب رحلة جديد</div>
          <div className="text-3xl font-black text-primary">{secondsLeft}s</div>
          <div className="h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="space-y-3 mb-5">
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <div className="text-xs text-muted-foreground">من</div>
              <div className="font-bold">{request.pickup_text ?? "—"}</div>
            </div>
          </div>
          {request.dest_text && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-rose-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <div className="text-xs text-muted-foreground">إلى</div>
                <div className="font-bold">{request.dest_text}</div>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between bg-muted/50 rounded-2xl px-3 py-2">
            <div className="text-xs text-muted-foreground">المسافة منك</div>
            <div className="font-bold text-sm">
              {offer.distance_km ? `${Number(offer.distance_km).toFixed(1)} كم` : "—"}
            </div>
          </div>
          {request.price_estimate && (
            <div className="flex items-center justify-between bg-primary/10 rounded-2xl px-3 py-2">
              <div className="text-xs font-bold">السعر التقديري</div>
              <div className="font-black text-primary">
                {Number(request.price_estimate).toLocaleString()} د.ع
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => doRespond("reject")}
            disabled={busy}
            className="py-3.5 rounded-2xl border border-border bg-card font-bold btn-press flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <X className="h-5 w-5" /> رفض
          </button>
          <button
            onClick={() => doRespond("accept")}
            disabled={busy}
            className="py-3.5 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-bold btn-press flex items-center justify-center gap-2 disabled:opacity-60 glow-primary"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
            قبول
          </button>
        </div>
      </div>
    </div>
  );
}
