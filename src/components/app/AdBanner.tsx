import { useEffect, useState } from "react";
import { useAdsPlacements } from "@/lib/data";
import { useMe } from "@/lib/data";
import { Button } from "@/components/ui/button";

export function AdBanner({ position = "bottom" }: { position?: string }) {
  const { data: me } = useMe();
  const { data: ads } = useAdsPlacements();
  const [hovered, setHovered] = useState(false);
  const active = ads?.filter((a) => a.position === position && a.is_active) ?? [];
  const ad = active[Math.floor(Math.random() * active.length)] || null;

  if (!me || !ad) return null;

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-30 flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border border-dashed bg-card p-3 shadow-xl"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex justify-between items-center w-full px-2">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Advertisement</span>
        <span className="text-[10px] text-muted-foreground">{ad.name}</span>
      </div>
      <div className="aspect-[16/9] w-full rounded-xl bg-muted/50 flex items-center justify-center overflow-hidden relative group">
        <div className="absolute inset-0 flex items-center justify-center bg-secondary/40">
          <span className="text-sm text-muted-foreground">{hovered ? "Ad clicked → advertiser page" : "Ad placeholder (Google Ads / ad network)"}</span>
        </div>
        <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center" />
      </div>
      <Button variant="outline" size="sm" className="text-xs" onClick={() => setHovered(!hovered)}>
        {hovered ? "Hide ad" : "View ad"}
      </Button>
    </div>
  );
}
