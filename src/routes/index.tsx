import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";
import { useWelcomePreferences } from "@/lib/welcome-preferences";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({ meta: [
    { title: "ممنون | النقل والخدمات" },
    { name: "description", content: "رحلات التاكسي والخدمات المنزلية في تطبيق ممنون." },
    { property: "og:title", content: "ممنون | النقل والخدمات" },
    { property: "og:description", content: "رحلات التاكسي والخدمات المنزلية في تطبيق ممنون." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Index,
});

function Index() {
  const { loading, session, roles, profile, authError, refresh } = useAuth();
  const { ready, completed } = useWelcomePreferences();

  if (loading || !ready) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="flex flex-col items-center gap-4">
          <div className="text-5xl font-black text-gradient">ممنون</div>
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="min-h-screen grid place-items-center px-6 text-center" dir="rtl">
        <div className="max-w-sm space-y-4">
          <div className="text-lg font-extrabold text-foreground">تعذّر تحميل بيانات الحساب</div>
          <p className="text-sm text-muted-foreground">{authError}</p>
          <button className="rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground" onClick={() => { void refresh(); }}>إعادة المحاولة</button>
        </div>
      </div>
    );
  }

  if (!session) return <Navigate to={completed ? "/auth" : "/welcome"} />;
  if (!profile) return <Navigate to="/select-role" />;
  if (roles.length === 0) return <Navigate to="/select-role" />;
  return <Navigate to="/home" />;
}
