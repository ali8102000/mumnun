import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  ssr: false,
  component: Index,
});

function Index() {
  const { loading, session, roles, profile } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="flex flex-col items-center gap-4">
          <div className="text-5xl font-black text-gradient">ممنون</div>
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!session) return <Navigate to="/auth" />;
  if (!profile) return <Navigate to="/auth" />;
  if (roles.length === 0) return <Navigate to="/select-role" />;
  return <Navigate to="/home" />;
}
