import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { coverPhoto } from "@/lib/photo-visibility";
import type { Tables } from "@/integrations/supabase/types";

export type Profile = Pick<Tables<"profiles">, "id" | "display_name" | "birthdate" | "gender" | "orientation" | "bio" | "city" | "country" | "verified" | "username" | "last_seen_at" | "is_online" | "created_at" | "looking_for">;

// Public profile type (safe columns only, age instead of birthdate)
export type PublicProfile = Omit<Profile, "birthdate"> & { age: number | null };
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
    if (!list.length) { setUrls({}); return; }
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
      const { data, error } = await supabase.rpc("get_profile_views_paginated", { _limit: 50, _offset: 0 });
      if (error) throw error;
      return { views: data ?? [], first: {} as Record<string, string> };
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
      if (!me) return [];
      const [{ data: albums }, { data: photos }] = await Promise.all([
        supabase.from("photo_albums").select("*").eq("user_id", me.user.id).order("created_at", { ascending: false }),
        supabase.from("photos").select("id,path,album_id,is_private,view_timer,position").eq("user_id", me.user.id).order("position"),
      ]);
      const byAlbum: Record<string, typeof photos> = {};
      (photos ?? []).forEach((p) => {
        const k = p.album_id ?? "none";
        if (!byAlbum[k]) byAlbum[k] = [];
        byAlbum[k]?.push(p);
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

async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Please sign in");
  return data.user.id;
}

export async function logProfileView(viewedId: string) {
  const { error } = await supabase.from("profile_views").insert({ viewer_id: await currentUserId(), viewed_id: viewedId });
  if (error) throw error;
}

export async function reportProfile(reportedId: string, reason: string, options?: { reasonCategory?: string; proofText?: string; proofFilePath?: string; autoBlock?: boolean }) {
  const { error } = await supabase.from("reports").insert({ 
    reporter_id: await currentUserId(), 
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
  const { error } = await supabase.from("referrals").insert({ code, referrer_id: await currentUserId() });
  if (error) throw error;
}

export async function adminSetFlags(targetId: string, verified: boolean, banned: boolean) {
  const { error } = await supabase.rpc("admin_set_flags", { _target: targetId, _verified: verified, _banned: banned });
  if (error) throw error;
}

export async function adminRecordAction(targetId: string, actionType: "ban" | "unban" | "verify" | "unverify" | "delete", details?: string) {
  const { error } = await supabase.from("admin_actions").insert({ admin_id: await currentUserId(), target_id: targetId, action_type: actionType, details: details ?? null });
  if (error) throw error;
}

export function useCoverPhoto(userId: string) {
  const { data: me } = useMe();
  const { data: photos = [] } = useQuery({
    queryKey: ["photo-covers"], enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase.from("photos").select("user_id,path,preview_path,is_private,album_id,position").order("position");
      if (error) throw error;
      return data ?? [];
    },
  });
  const cover = coverPhoto(photos.filter(p => p.user_id === userId));
  const original = useSigned("photos", [cover.blurred ? null : cover.path]);
  const preview = useSigned("photo-previews", [cover.blurred ? cover.path : null]);
  return { url: cover.path ? (cover.blurred ? preview[cover.path] : original[cover.path]) : undefined, blurred: cover.blurred };
}
