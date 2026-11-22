import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Profile = Tables<"profiles">;
export type Photo = Tables<"photos">;
export type Connection = Tables<"connections">;
export type Message = Tables<"messages">;
export type ProfileView = Tables<"profile_views">;
export type PhotoAlbum = Tables<"photo_albums">;
export type Report = Tables<"reports">;
export type AdminAction = Tables<"admin_actions">;
export type Referral = Tables<"referrals">;
export type AdsPlacement = Tables<"ads_placements">;

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
export async function signPaths(bucket: string, paths: string[], expiresInSeconds = 300): Promise<Record<string, string>> {
  const now = Date.now();
  const out: Record<string, string> = {};
  const need = paths.filter((p) => {
    const c = urlCache.get(bucket + p);
    if (c && c.exp > now) { out[p] = c.url; return false; }
    return true;
  });
  if (need.length) {
    const { data } = await supabase.storage.from(bucket).createSignedUrls(need, expiresInSeconds);
    data?.forEach((d) => {
      if (d.signedUrl && d.path) {
        urlCache.set(bucket + d.path, { url: d.signedUrl, exp: now + (expiresInSeconds - 1) * 1000 });
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
  }, [bucket, key]);
  return urls;
}

/* ---------- New feature hooks ---------- */

export function useProfileViews() {
  return useQuery({
    queryKey: ["profile-views"],
    queryFn: async () => {
      const [{ data: views }, { data: photos }] = await Promise.all([
        supabase.from("profile_views").select("*").order("created_at", { ascending: false }),
        supabase.from("photos").select("user_id,path,position").order("position"),
      ]);
      const first: Record<string, string> = {};
      photos?.forEach((p) => { if (!first[p.user_id]) first[p.user_id] = p.path; });
      return { views: views ?? [], first };
    },
  });
}

export function usePhotoAlbums() {
  return useQuery({
    queryKey: ["photo-albums"],
    queryFn: async () => {
      const { data } = await supabase.from("photo_albums").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });
}

export function useMyAlbumsWithPhotos() {
  const { data: me } = useMe();
  return useQuery({
    queryKey: ["my-albums-photos", me?.user.id],
    enabled: !!me,
    queryFn: async () => {
      const [{ data: albums }, { data: photos }] = await Promise.all([
        supabase.from("photo_albums").select("*").eq("user_id", me!.user.id).order("created_at", { ascending: false }),
        supabase.from("photos").select("id,path,album_id,is_private,view_timer,position").eq("user_id", me!.user.id).order("position"),
      ]);
      const byAlbum: Record<string, typeof photos> = {};
      (photos ?? []).forEach((p) => {
        const k = p.album_id ?? "none";
        if (!byAlbum[k]) byAlbum[k] = [];
        byAlbum[k].push(p);
      });
      return (albums ?? []).map((a) => ({ ...a, photos: byAlbum[a.id] ?? [] }));
    },
  });
}

export function useReports() {
  return useQuery({
    queryKey: ["reports"],
    queryFn: async () => {
      const { data } = await supabase.from("reports").select("*, reporter:profiles!reports_reporter_id_fkey(display_name), reported:profiles!reports_reported_id_fkey(display_name)").order("created_at", { ascending: false });
      return data ?? [];
    },
  });
}

export function useAdminActions() {
  return useQuery({
    queryKey: ["admin-actions"],
    queryFn: async () => {
      const { data } = await supabase.from("admin_actions").select("*, admin:profiles!admin_actions_admin_id_fkey(display_name), target:profiles!admin_actions_target_id_fkey(display_name)").order("created_at", { ascending: false });
      return data ?? [];
    },
  });
}

export function useReferrals() {
  return useQuery({
    queryKey: ["referrals"],
    queryFn: async () => {
      const { data } = await supabase.from("referrals").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });
}

export function useAdsPlacements() {
  return useQuery({
    queryKey: ["ads-placements"],
    queryFn: async () => {
      const { data } = await supabase.from("ads_placements").select("*").eq("is_active", true).order("position");
      return data ?? [];
    },
  });
}

/* ---------- Actions ---------- */

export async function logProfileView(viewedId: string) {
  const { error } = await supabase.from("profile_views").insert({ viewer_id: (await supabase.auth.getUser()).data.user!.id, viewed_id: viewedId });
  if (error) throw error;
}

export async function reportProfile(reportedId: string, reason: string, options?: { reasonCategory?: string; proofText?: string; proofFilePath?: string; autoBlock?: boolean }) {
  const { error } = await supabase.from("reports").insert({ 
    reporter_id: (await supabase.auth.getUser()).data.user!.id, 
    reported_id: reportedId, 
    reason,
    reason_category: options?.reasonCategory ?? null,
    proof_text: options?.proofText ?? null,
    proof_file_path: options?.proofFilePath ?? null,
    auto_blocked: options?.autoBlock ?? false,
  });
  if (error) throw error;
}

export async function createReferral(code: string) {
  const { error } = await supabase.from("referrals").insert({ code });
  if (error) throw error;
}

export async function adminSetFlags(targetId: string, verified: boolean, banned: boolean) {
  const { error } = await supabase.rpc("admin_set_flags", { _target: targetId, _verified: verified, _banned: banned });
  if (error) throw error;
}

export async function adminRecordAction(targetId: string, actionType: "ban" | "unban" | "verify" | "unverify" | "delete", details?: string) {
  const { error } = await supabase.from("admin_actions").insert({ admin_id: (await supabase.auth.getUser()).data.user!.id, target_id: targetId, action_type: actionType, details });
  if (error) throw error;
}
