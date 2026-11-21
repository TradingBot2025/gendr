import { BadgeCheck, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { ageOf, type Profile } from "@/lib/data";

export function ProfileCard({ p, photo, action }: { p: Profile; photo?: string; action?: ReactNode }) {
  const age = ageOf(p.birthdate);
  return (
    <div className="overflow-hidden rounded-3xl border bg-card shadow-soft">
      <div className="relative aspect-[4/5] bg-muted">
        {photo ? <img src={photo} alt={p.display_name ?? ""} className="h-full w-full object-cover" loading="lazy" /> : (
          <div className="flex h-full items-center justify-center font-display text-6xl text-muted-foreground">{p.display_name?.[0]}</div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-stage/80 to-transparent p-4 text-stage-foreground">
          <div className="flex items-center gap-1.5 text-xl font-semibold">
            {p.display_name}{age !== null && <span className="font-normal">, {age}</span>}
            {p.verified && <BadgeCheck className="h-5 w-5 text-primary-glow" aria-label="Verified" />}
          </div>
          <div className="flex items-center gap-1 text-sm opacity-90"><MapPin className="h-3.5 w-3.5" />{[p.city, p.country].filter(Boolean).join(", ")}</div>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap gap-1.5 text-xs">
          {p.gender && <span className="rounded-full bg-accent px-2.5 py-1 text-accent-foreground">{p.gender}</span>}
          {p.orientation && <span className="rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">{p.orientation}</span>}
        </div>
        {p.bio && <p className="line-clamp-2 text-sm text-muted-foreground">{p.bio}</p>}
        {action}
      </div>
    </div>
  );
}
