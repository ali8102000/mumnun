import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const grantProviderRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { role: "driver" | "worker" }) => {
    if (input?.role !== "driver" && input?.role !== "worker") {
      throw new Error("Invalid role");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.rpc("grant_provider_role_safe", {
      _user_id: userId,
      _role: data.role,
    });
    if (error) throw new Error("Failed to grant role");
    return { ok: true };
  });
