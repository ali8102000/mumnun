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

    // Require the corresponding provider profile to exist before granting the role.
    const table = data.role === "driver" ? "driver_profiles" : "worker_profiles";
    const { data: prof, error: profErr } = await supabaseAdmin
      .from(table)
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (profErr) throw new Error("Profile lookup failed");
    if (!prof) throw new Error("Provider profile required before granting role");

    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: data.role });
    if (error && !error.message.toLowerCase().includes("duplicate")) {
      throw new Error("Failed to grant role");
    }
    return { ok: true };
  });
