import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfileLayout,
});

function ProfileLayout() {
  const { data: me } = useMe();

  return <Outlet />;
}