import { BadgeCheck, MapPin, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ageOf, type Profile } from "@/lib/data";

export function ProfileCard({ p, photo, action, to, toParams }: { p: Profile; photo?: string | undefined; action?: ReactNode; to?: string; toParams?: Record<string, string> }) {
  const age = ageOf(p.birthdate);
  
  const handleClick = () => {
    if (to && toParams) {
      console.log("[ProfileCard] Navigating to:", to, "with params:", toParams);
    }
  };
  
  const cardContent = (
    <>
      <div className="relative aspect-[4/5] bg-muted">
        {photo ? (
          <img
            src={photo}
            alt={p.display_name ?? ""}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className="flex h-full items-center justify-center font-display text-6xl text-muted-foreground">{p.display_name?.[0]}</div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-stage/80 to-transparent p-4 text-stage-foreground">
          <div className="flex items-center gap-1.5 text-xl font-semibold">
            {p.display_name}{age !== null && <span className="font-normal">, {age}</span>}
            {p.verified && <BadgeCheck className="h-5 w-5 text-primary-glow" aria-label="Verified" />}
          </div>
          <div className="flex items-center gap-1 text-sm opacity-90"><MapPin className="h-3.5 w-3.5" />{[p.city, p.country].filter(Boolean).join(", ")}</div>
        </div>
        {to && <div className="absolute top-3 right-3 bg-white/90 rounded-full p-1.5 shadow"><ChevronRight className="h-4 w-4 text-muted-foreground" /></div>}
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

  if (to) {
    return (
      <Link to={to} params={toParams} className="overflow-hidden rounded-3xl border bg-card shadow-soft transition-shadow hover:shadow-lg cursor-pointer" onClick={handleClick}>
        {cardContent}
      </Link>
    );
  }
  
  return (
    <div className="overflow-hidden rounded-3xl border bg-card shadow-soft" onClick={handleClick}>
      {cardContent}
    </div>
  );
}