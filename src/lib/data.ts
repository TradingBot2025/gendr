import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Profile = Tables<"profiles">;
export type Photo = Tables<"photos">;
export type Connection = Tables<"connections">;

export const GENDERS = [
  "Woman", "Man", "Trans woman", "Trans man", "Non-binary", "Genderqueer", "Genderfluid",
  "Agender", "Bigender", "Two-Spirit", "Intersex", "Demigirl", "Demiboy", "Questioning", "Other",
];
export const ORIENTATIONS = [
  "Straight", "Gay", "Lesbian", "Bisexual", "Pansexual", "Asexual", "Demisexual",
  "Queer", "Questioning", "Other",
];

export function ageOf(birthdate: string | null): number | null {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const [{ data: profile }, { data: roles }, { data: photos }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
        supabase.from("photos").select("*").eq("user_id", u.user.id).order("position"),
      ]);
      const isAdmin = !!roles?.some((r) => r.role === "admin");
      const complete = !!(profile?.display_name && profile.gender && profile.orientation && profile.birthdate && profile.city && (photos?.length ?? 0) > 0);
      return { user: u.user, profile, isAdmin, photos: photos ?? [], complete };
    },
  });
}

const urlCache = new Map<string, { url: string; exp: number }>();
export async function signPaths(bucket: string, paths: string[]): Promise<Record<string, string>> {
  const now = Date.now();
  const out: Record<string, string> = {};
  const need = paths.filter((p) => {
    const c = urlCache.get(bucket + p);
    if (c && c.exp > now) { out[p] = c.url; return false; }
    return true;
  });
  if (need.length) {
    const { data } = await supabase.storage.from(bucket).createSignedUrls(need, 3600);
    data?.forEach((d) => {
      if (d.signedUrl && d.path) {
        urlCache.set(bucket + d.path, { url: d.signedUrl, exp: now + 3500_000 });
        out[d.path] = d.signedUrl;
      }
    });
  }
  return out;
}

export function useSigned(bucket: string, paths: (string | null | undefined)[]) {
  const key = paths.filter(Boolean).join("|");
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const list = paths.filter((p): p is string => !!p);
    if (!list.length) return;
    let alive = true;
    signPaths(bucket, list).then((u) => alive && setUrls(u));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket, key]);
  return urls;
}
