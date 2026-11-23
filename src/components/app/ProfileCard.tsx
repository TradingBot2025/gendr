import { BadgeCheck, MapPin, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ageOf, useCoverPhoto, type Profile } from "@/lib/data";

export function ProfileCard({ p, photo, action, to, toParams }: { p: Profile; photo?: string | undefined; action?: ReactNode; to?: string; toParams?: Record<string, string> }) {
  const age = ageOf(p.birthdate);
  const cover = useCoverPhoto(p.id);
  const image = cover.url ?? (!cover.blurred ? photo : undefined);
  
  const cardContent = (
    <>
      <div className="relative aspect-[4/5] bg-muted">
        {to && <Link to={to} {...(toParams ? { params: toParams } : {})} aria-label={`View ${p.display_name ?? "member"} profile`} className="absolute inset-0 z-10" />}
        {image ? (
          <img
            src={image}
            alt={p.display_name ?? ""}
            className={`h-full w-full object-cover ${cover.blurred ? "blur-sm" : ""}`}
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <img src="/profile-placeholder.svg" alt="No public profile photo" className="h-full w-full object-cover" />
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-stage/80 to-transparent p-4 text-stage-foreground">
          <div className="flex items-center gap-1.5 text-xl font-semibold">
            {p.display_name}{age !== null && <span className="font-normal">, {age}</span>}
            {p.verified && <BadgeCheck className="h-5 w-5 text-primary-glow" aria-label="Verified" />}
          </div>
          <div className="flex items-center gap-1 text-sm opacity-90"><MapPin className="h-3.5 w-3.5" />{[p.city, p.country].filter(Boolean).join(", ")}</div>
        </div>
        {to && <div className="absolute top-3 right-3 bg-card/90 rounded-full p-1.5 shadow"><ChevronRight className="h-4 w-4 text-muted-foreground" /></div>}
      </div>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap gap-1.5 text-xs">
          {p.gender && <span className="rounded-full bg-accent px-2.5 py-1 text-accent-foreground">{p.gender}</span>}
          {p.orientation && <span className="rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">{p.orientation}</span>}
        </div>
        {p.bio && <p className="line-clamp-2 text-sm text-muted-foreground">{p.bio}</p>}
        {action}
      </div>
    </>
  );

  return <div className="overflow-hidden rounded-3xl border bg-card shadow-soft">{cardContent}</div>;
}
