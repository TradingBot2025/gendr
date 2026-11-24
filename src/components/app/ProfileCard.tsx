import { BadgeCheck, MapPin, ChevronRight } from "lucide-react";
import { memo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ageOf, useCoverPhoto, type Profile, type PublicProfile } from "@/lib/data";
import { usePresence } from "@/lib/presence";

type ProfileLike = Pick<
  Profile,
  "id" | "display_name" | "gender" | "orientation" | "city" | "country"
> & {
  age?: number | null;
  birthdate?: string | null;
  verified?: boolean | null;
  last_seen_at?: string | null;
  is_online?: boolean | null;
  bio?: string | null;
};

function getAge(p: ProfileLike): number | null {
  if ("age" in p && p.age !== undefined) return p.age;
  if ("birthdate" in p && p.birthdate) return ageOf(p.birthdate);
  return null;
}

export const ProfileCard = memo(function ProfileCard({
  p,
  photo,
  action,
  to,
  toParams,
  compact = false,
}: {
  p: ProfileLike;
  photo?: string | undefined;
  action?: ReactNode;
  to?: string;
  toParams?: Record<string, string>;
  compact?: boolean;
}) {
  const age = getAge(p);
  const cover = useCoverPhoto(p.id);
  const image = cover.url ?? (!cover.blurred ? photo : undefined);
  const presence = usePresence();
  // Live presence from Supabase Realtime (accurate "now"). The old DB
  // is_online/last_seen_at columns were never writable by users, so they're not
  // used here.
  const isOnline = presence.isOnline(p.id);

  const cardContent = (
    <>
      <div className={`relative bg-muted ${compact ? "aspect-square" : "aspect-[4/5]"}`}>
        {to && (
          <Link
            to={to}
            {...(toParams ? { params: toParams } : {})}
            aria-label={`View ${p.display_name ?? "member"} profile`}
            className="absolute inset-0 z-10"
          />
        )}
        {image ? (
          <img
            src={image}
            alt={p.display_name ?? ""}
            className={`h-full w-full object-cover ${cover.blurred ? "blur-sm" : ""}`}
            loading="lazy"
            decoding="async"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <img
            src="/profile-placeholder.svg"
            alt="No public profile photo"
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        )}
        {isOnline ? (
          <span
            className="absolute right-2 top-2 z-20 h-3 w-3 rounded-full border-2 border-card bg-green-500"
            title="Online"
            aria-label="Online"
          />
        ) : (
          <span
            className="absolute right-2 top-2 z-20 h-3 w-3 rounded-full border-2 border-card bg-red-500"
            title="Offline"
            aria-label="Offline"
          />
        )}
        <div
          className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-stage/80 to-transparent text-stage-foreground ${compact ? "p-2" : "p-4"}`}
        >
          <div
            className={`flex items-center gap-1 font-semibold ${compact ? "text-sm" : "text-xl"}`}
          >
            <span className="truncate">{p.display_name}</span>
            {age !== null && <span className="font-normal">, {age}</span>}
            {p.verified && (
              <BadgeCheck
                className={`${compact ? "h-3.5 w-3.5" : "h-5 w-5"} shrink-0 text-primary-glow`}
                aria-label="Verified"
              />
            )}
          </div>
          {!compact && (
            <div className="flex items-center gap-1 text-sm opacity-90">
              <MapPin className="h-3.5 w-3.5" />
              {[p.city, p.country].filter(Boolean).join(", ")}
            </div>
          )}
        </div>
        {!compact && to && (
          <div className="absolute top-3 right-3 z-20 rounded-full bg-card/90 p-1.5 shadow">
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>
      {compact ? (
        action ? (
          <div className="p-2">{action}</div>
        ) : null
      ) : (
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap gap-1.5 text-xs">
            {p.gender && (
              <span className="rounded-full bg-accent px-2.5 py-1 text-accent-foreground">
                {p.gender}
              </span>
            )}
            {p.orientation && (
              <span className="rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
                {p.orientation}
              </span>
            )}
          </div>
          {p.bio && <p className="line-clamp-2 text-sm text-muted-foreground">{p.bio}</p>}
          {action}
        </div>
      )}
    </>
  );

  return (
    <div
      className={`overflow-hidden border bg-card shadow-soft ${compact ? "rounded-2xl" : "rounded-3xl"}`}
    >
      {cardContent}
    </div>
  );
});
