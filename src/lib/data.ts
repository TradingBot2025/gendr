import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { coverPhoto } from "@/lib/photo-visibility";
import type { Tables } from "@/integrations/supabase/types";

export type Profile = Pick<
  Tables<"profiles">,
  | "id"
  | "display_name"
  | "birthdate"
  | "gender"
  | "orientation"
  | "bio"
  | "city"
  | "country"
  | "verified"
  | "username"
  | "last_seen_at"
  | "is_online"
  | "created_at"
  | "looking_for"
  | "height"
  | "weight"
  | "education"
  | "children"
  | "marital_status"
>;

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

export const GENDERS = [
  "Woman",
  "Man",
  "Trans woman",
  "Trans man",
  "Non-binary",
  "Genderqueer",
  "Genderfluid",
  "Agender",
  "Bigender",
  "Two-Spirit",
  "Intersex",
  "Demigirl",
  "Demiboy",
  "Questioning",
  "Other",
];
export const ORIENTATIONS = [
  "Straight",
  "Gay",
  "Lesbian",
  "Bisexual",
  "Pansexual",
  "Asexual",
  "Demisexual",
  "Queer",
  "Questioning",
  "Other",
];
export const EDUCATION_LEVELS = [
  "High school",
  "Vocational / Trade school",
  "Some college",
  "Bachelor's degree",
  "Master's degree",
  "Doctorate / PhD",
  "Prefer not to say",
];
export const CHILDREN_OPTIONS = [
  "No children",
  "Have children",
  "Want children",
  "Don't want children",
  "Prefer not to say",
];
export const MARITAL_STATUS_OPTIONS = [
  "Single",
  "In a relationship",
  "Married",
  "Separated",
  "Divorced",
  "Widowed",
  "Prefer not to say",
];

export function ageOf(birthdate: string | null): number | null {
  if (!birthdate) return null;
  // Parse the date-only string manually. `new Date("YYYY-MM-DD")` is parsed as
  // UTC midnight, which reports the previous day in negative UTC offsets and can
  // throw the age (and any derived date) off by one — the classic "date shows
  // incorrectly" bug. Manual parsing also avoids rendering "NaN" for bad values.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthdate);
  let by: number;
  let bm: number;
  let bd: number;
  if (m?.[1] && m[2] && m[3]) {
    by = parseInt(m[1], 10);
    bm = parseInt(m[2], 10) - 1;
    bd = parseInt(m[3], 10);
  } else {
    const d = new Date(birthdate);
    if (Number.isNaN(d.getTime())) return null;
    by = d.getFullYear();
    bm = d.getMonth();
    bd = d.getDate();
  }
  if (!by || Number.isNaN(by)) return null;
  const n = new Date();
  let a = n.getFullYear() - by;
  if (n.getMonth() < bm || (n.getMonth() === bm && n.getDate() < bd)) a--;
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
      const complete = !!(
        profile?.display_name &&
        profile.gender &&
        profile.orientation &&
        profile.birthdate &&
        profile.city &&
        (photos?.length ?? 0) > 0
      );
      return { user: u.user, profile, isAdmin, photos: photos ?? [], complete };
    },
  });
}

const urlCache = new Map<string, { url: string; exp: number }>();
export async function signPaths(
  bucket: string,
  paths: string[],
  expiresInSeconds = 300,
): Promise<Record<string, string>> {
  const now = Date.now();
  const out: Record<string, string> = {};
  const need = paths.filter((p) => {
    const c = urlCache.get(bucket + p);
    if (c && c.exp > now) {
      out[p] = c.url;
      return false;
    }
    return true;
  });
  if (need.length) {
    const { data } = await supabase.storage.from(bucket).createSignedUrls(need, expiresInSeconds);
    data?.forEach((d) => {
      if (d.signedUrl && d.path) {
        urlCache.set(bucket + d.path, {
          url: d.signedUrl,
          exp: now + (expiresInSeconds - 1) * 1000,
        });
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
    if (!list.length) {
      setUrls({});
      return;
    }
    let alive = true;
    signPaths(bucket, list).then((u) => alive && setUrls(u));
    return () => {
      alive = false;
    };
  }, [bucket, key]);
  return urls;
}

/* ---------- New feature hooks ---------- */

export function useProfileViews() {
  return useQuery({
    queryKey: ["profile-views"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_profile_views_paginated", {
        _limit: 50,
        _offset: 0,
      });
      if (error) throw error;
      return { views: data ?? [], first: {} as Record<string, string> };
    },
  });
}

export function usePhotoAlbums() {
  return useQuery({
    queryKey: ["photo-albums"],
    queryFn: async () => {
      const { data } = await supabase
        .from("photo_albums")
        .select("*")
        .order("created_at", { ascending: false });
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
        supabase
          .from("photo_albums")
          .select("*")
          .eq("user_id", me.user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("photos")
          .select("id,path,album_id,is_private,view_timer,position")
          .eq("user_id", me.user.id)
          .order("position"),
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
      // Fetch reports raw — do NOT rely on a PostgREST table embed
      // (profiles!reports_reporter_id_fkey). If that embed errors for any reason
      // (constraint name drift, RLS), the entire query returns null and the
      // admin reports tab renders blank — which is exactly "reports not showing".
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const reports = (data ?? []) as Array<Record<string, unknown>>;
      // Resolve reporter/reported names from profiles in a second query (admins
      // can read all profiles), merged in by id.
      const ids = Array.from(
        new Set(
          reports
            .flatMap((r) => [r.reporter_id as string, r.reported_id as string])
            .filter(Boolean),
        ),
      );
      const byId = new Map<string, { display_name?: string; username?: string }>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,display_name,username")
          .in("id", ids);
        (profs ?? []).forEach((p) =>
          byId.set(p.id as string, {
            display_name: (p as { display_name?: string }).display_name ?? undefined,
            username: (p as { username?: string }).username ?? undefined,
          }),
        );
      }
      return reports.map((r) => ({
        ...r,
        reporter: byId.get(r.reporter_id as string) ?? null,
        reported: byId.get(r.reported_id as string) ?? null,
      }));
    },
  });
}

export function useAdminActions() {
  return useQuery({
    queryKey: ["admin-actions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("admin_actions")
        .select(
          "*, admin:profiles!admin_actions_admin_id_fkey(display_name), target:profiles!admin_actions_target_id_fkey(display_name)",
        )
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });
}

export function useReferrals() {
  return useQuery({
    queryKey: ["referrals"],
    queryFn: async () => {
      const { data } = await supabase
        .from("referrals")
        .select("*")
        .order("created_at", { ascending: false });
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
  const { error } = await supabase
    .from("profile_views")
    .insert({ viewer_id: await currentUserId(), viewed_id: viewedId });
  if (error) throw error;
}

export async function reportProfile(
  reportedId: string,
  reason: string,
  options?: {
    reasonCategory?: string;
    proofText?: string;
    proofFilePath?: string;
    autoBlock?: boolean;
  },
) {
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
  const { error } = await supabase
    .from("referrals")
    .insert({ code, referrer_id: await currentUserId() });
  if (error) throw error;
}

export async function adminSetFlags(targetId: string, verified: boolean, banned: boolean) {
  const { error } = await supabase.rpc("admin_set_flags", {
    _target: targetId,
    _verified: verified,
    _banned: banned,
  });
  if (error) throw error;
}

export async function adminRecordAction(
  targetId: string,
  actionType: "ban" | "unban" | "verify" | "unverify" | "delete",
  details?: string,
) {
  const { error } = await supabase.from("admin_actions").insert({
    admin_id: await currentUserId(),
    target_id: targetId,
    action_type: actionType,
    details: details ?? null,
  });
  if (error) throw error;
}

/* ---------- Blocking ---------- */
// Requires the public.blocked_users table (see MIGRATIONS TO APPLY). Fails
// gracefully with a thrown error the caller can toast if the table is missing.

export async function blockUser(blockedId: string) {
  const uid = await currentUserId();
  if (blockedId === uid) return;
  // Remove any existing connection so the blocked person can't keep messaging
  // or calling from an already-open chat.
  await supabase
    .from("connections")
    .delete()
    .or(
      `and(requester.eq.${uid},addressee.eq.${blockedId}),and(requester.eq.${blockedId},addressee.eq.${uid})`,
    );
  const { error } = await supabase
    .from("blocked_users")
    .insert({ blocker_id: uid, blocked_id: blockedId } as never);
  if (error) throw error;
}

export async function unblockUser(blockedId: string) {
  const uid = await currentUserId();
  const { error } = await supabase
    .from("blocked_users")
    .delete()
    .eq("blocker_id", uid)
    .eq("blocked_id", blockedId);
  if (error) throw error;
}

export function useBlockedContacts() {
  const { data: me } = useMe();
  return useQuery({
    queryKey: ["blocked-contacts", me?.user.id],
    enabled: !!me,
    queryFn: async () => {
      const { data: blocks } = await supabase
        .from("blocked_users")
        .select("blocked_id, created_at")
        .order("created_at", { ascending: false });
      const rows = (blocks ?? []) as Array<{ blocked_id: string; created_at: string }>;
      if (!rows.length)
        return [] as Array<{
          blocked_id: string;
          created_at: string;
          profile: PublicProfile | null;
        }>;
      const ids = rows.map((b) => b.blocked_id);
      const { data: profiles } = await supabase
        .from("public_profiles")
        .select("id,username,display_name")
        .in("id", ids);
      const byId = new Map((profiles ?? []).map((p) => [p.id, p as unknown as PublicProfile]));
      return rows
        .map((r) => ({ ...r, profile: byId.get(r.blocked_id) ?? null }))
        .filter((x) => x.profile !== null);
    },
  });
}

export function useCoverPhoto(userId: string) {
  const { data: me } = useMe();
  const { data: photos = [] } = useQuery({
    queryKey: ["photo-covers"],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("photos")
        .select("user_id,path,preview_path,is_private,album_id,position")
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });
  const cover = coverPhoto(photos.filter((p) => p.user_id === userId));
  const original = useSigned("photos", [cover.blurred ? null : cover.path]);
  const preview = useSigned("photo-previews", [cover.blurred ? cover.path : null]);
  return {
    url: cover.path ? (cover.blurred ? preview[cover.path] : original[cover.path]) : undefined,
    blurred: cover.blurred,
  };
}
