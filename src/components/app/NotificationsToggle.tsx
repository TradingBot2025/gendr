import { useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  enableNotifications,
  notificationPermission,
  type NotificationPermissionLike,
} from "@/lib/push";

// Lets the user grant notification permission so they get alerts for messages,
// matches, connection/album requests and calls even when the app is minimized.
export function NotificationsToggle() {
  const [perm, setPerm] = useState<NotificationPermissionLike>("default");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPerm(notificationPermission());
  }, []);

  const onEnable = async () => {
    setBusy(true);
    try {
      const result = await enableNotifications();
      setPerm(notificationPermission());
      if (result === "granted") {
        toast.success("Notifications enabled on this device");
      } else if (result === "denied") {
        toast.error("Notifications were blocked. Enable them in your browser settings.");
      } else if (result === "unsupported") {
        toast.error("This browser doesn't support notifications here.");
      }
    } finally {
      setBusy(false);
    }
  };

  const granted = perm === "granted";
  const denied = perm === "denied";
  const unsupported = perm === "unsupported";

  return (
    <section className="rounded-3xl border bg-card p-6 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            {granted ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
          </div>
          <div>
            <h2 className="text-xl font-semibold">Push notifications</h2>
            <p className="text-xs text-muted-foreground">
              {granted
                ? "You'll get alerts for messages, matches and album requests — even when the app is minimized."
                : denied
                  ? "Blocked in your browser. Open site settings to allow notifications."
                  : unsupported
                    ? "Not supported on this device/browser."
                    : "Get notified about new messages, matches and requests."}
            </p>
          </div>
        </div>
        {granted ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <BellRing className="h-3.5 w-3.5" /> On
          </span>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={onEnable}
            disabled={busy || denied || unsupported}
          >
            <Bell className="mr-1.5 h-4 w-4" />
            {busy ? "Enabling…" : denied ? "Blocked" : "Enable"}
          </Button>
        )}
      </div>
    </section>
  );
}
