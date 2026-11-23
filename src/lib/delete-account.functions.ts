import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { password: string; target_id?: string }) => {
    if (typeof d?.password !== "string" || d.password.length === 0)
      throw new Error("Password is required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { target_id, password } = data;

    // Re-authenticate to confirm password
    const { data: u, error: userErr } = await supabase.auth.getUser();
    if (userErr || !u.user) throw new Error("Not authenticated");
    const { error: signErr } = await supabase.auth.signInWithPassword({
      email: u.user.email!,
      password,
    });
    if (signErr) throw new Error("Incorrect password");

    const target = target_id ?? userId;

    // Only admins may delete other accounts
    if (target !== userId) {
      const [{ data: roles }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
      const isAdmin = !!roles?.some((r) => r.role === "admin");
      if (!isAdmin) throw new Error("Not allowed");
    }

    // Delete user data (cascades via FK on auth.users delete, but clean explicitly)
    await supabase
      .from("profile_views")
      .delete()
      .or(`viewer_id.eq.${target},viewed_id.eq.${target}`);
    await supabase.from("photo_albums").delete().eq("user_id", target);
    await supabase.from("photos").delete().eq("user_id", target);
    await supabase.from("connections").delete().or(`requester.eq.${target},addressee.eq.${target}`);
    await supabase.from("messages").delete().or(`sender.eq.${target}`);
    await supabase.from("reports").delete().or(`reporter_id.eq.${target},reported_id.eq.${target}`);
    await supabase
      .from("referrals")
      .delete()
      .or(`referrer_id.eq.${target},referee_id.eq.${target}`);
    await supabase
      .from("admin_actions")
      .delete()
      .or(`admin_id.eq.${target},target_id.eq.${target}`);
    await supabase.from("profiles").delete().eq("id", target);
    await supabase.from("user_roles").delete().eq("user_id", target);

    // Remove the auth account (service role needed)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: adminErr } = await supabaseAdmin.auth.admin.deleteUser(target);
    if (adminErr) throw adminErr;

    return { ok: true };
  });
