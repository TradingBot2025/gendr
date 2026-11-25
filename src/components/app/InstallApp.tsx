import { useEffect, useState } from "react";
import { Apple, Download, Share, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// Captured beforeinstallprompt event (Chromium only).
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || navigator.platform === "MacIntel";
}

// Build an iOS ".mobileconfig" profile that installs Gender as a Home Screen
// web app (Web Clip) pointing at the current site.
function downloadIosConfig() {
  const url = window.location.origin;
  const uuid = "0000" + crypto.randomUUID().slice(0, 4).toUpperCase();
  const payloadUuid = crypto.randomUUID().toUpperCase();
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadType</key>
      <string>com.apple.webClip.managed</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>PayloadUUID</key>
      <string>${payloadUuid}</string>
      <key>PayloadDisplayName</key>
      <string>Gender</string>
      <key>PayloadIdentifier</key>
      <string>com.gender.webclip</string>
      <key>URL</key>
      <string>${url}</string>
      <key>IsRemovable</key>
      <true/>
      <key>FullScreen</key>
      <true/>
      <key>Precomposed</key>
      <true/>
    </dict>
  </array>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
  <key>PayloadUUID</key>
  <string>${uuid}</string>
  <key>PayloadDisplayName</key>
  <string>Install Gender</string>
  <key>PayloadIdentifier</key>
  <string>com.gender.install</string>
  <key>PayloadDescription</key>
  <string>Adds Gender to your Home Screen as a full-screen app.</string>
  <key>PayloadOrganization</key>
  <string>Gender</string>
</dict>
</plist>`;
  const blob = new Blob([plist], { type: "application/x-apple-aspen-config" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "Gender.mobileconfig";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

type Platform = "ios" | "android" | "desktop";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua) || (navigator.platform === "MacIntel" && "ontouchend" in window))
    return "ios";
  if (/android/.test(ua)) return "android";
  return "desktop";
}

/**
 * Install-to-phone UI. Shows a one-tap Install button where the browser
 * supports it (Android/Chrome/Edge), step-by-step instructions on iOS, and a
 * downloadable iOS config profile.
 *
 * `variant="section"` renders a full marketing block (landing page);
 * `variant="banner"` renders a slim dismissible bar (dashboard/home).
 */
export function InstallApp({ variant = "section" }: { variant?: "section" | "banner" }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // Default to "desktop" during SSR, then detect the real platform on the client
  // to avoid a hydration mismatch.
  const [platform, setPlatform] = useState<Platform>("desktop");

  useEffect(() => {
    setPlatform(detectPlatform());
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || (dismissed && variant === "banner")) return null;

  const handleInstall = async () => {
    if (deferred && platform !== "ios") {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      setInstalled(true);
      return;
    }
    if (platform === "ios") {
      toast("On iPhone / iPad", {
        description:
          "Open this site in Safari, tap the Share button, then choose “Add to Home Screen”.",
        duration: 8000,
      });
      return;
    }
    toast("Install Gender", {
      description:
        platform === "android"
          ? "In Chrome, open the menu, then “Install app” or “Add to Home screen”."
          : "Open this site in Chrome or Safari on your phone, then use the install / Add to Home Screen option.",
      duration: 8000,
    });
  };

  // ---- Banner variant (dashboard/home) ----
  if (variant === "banner") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border bg-gradient-primary p-4 text-primary-foreground shadow-soft">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Get the Gender app</p>
          <p className="truncate text-xs opacity-90">
            Install for faster access and push notifications.
          </p>
        </div>
        <Button size="sm" variant="secondary" className="shrink-0" onClick={handleInstall}>
          {deferred ? "Install" : platform === "ios" ? "How" : "Install"}
        </Button>
        <button
          aria-label="Dismiss"
          className="shrink-0 rounded-md p-1 opacity-80 hover:opacity-100"
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // ---- Section variant (landing page) ----
  return (
    <section className="rounded-3xl border bg-card p-8 shadow-soft md:p-12">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-1 text-sm font-medium text-accent-foreground">
          <Smartphone className="h-4 w-4" /> Install the app
        </div>
        <h2 className="text-3xl font-bold md:text-4xl">Take Gender with you</h2>
        <p className="mt-3 text-muted-foreground">
          Add Gender to your phone's home screen for an app-like experience — full screen, faster
          loading, and push notifications for messages, matches and calls. Works on iPhone and
          Android.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border bg-background p-5 text-left">
            <div className="mb-3 flex items-center gap-2 font-semibold">
              <Apple className="h-5 w-5" /> iPhone / iPad
            </div>
            <ol className="space-y-1.5 text-sm text-muted-foreground">
              <li>1. Open this site in Safari</li>
              <li>
                2. Tap the <Share className="inline h-4 w-4" /> Share button
              </li>
              <li>
                3. Choose <strong>Add to Home Screen</strong>
              </li>
            </ol>
            <Button variant="outline" size="sm" className="mt-4 w-full" onClick={downloadIosConfig}>
              <Download className="mr-2 h-4 w-4" /> Download iOS config
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              On iOS 12.2+? Download the config, open it in Safari, then install it in Settings →
              General → VPN &amp; Device Management.
            </p>
          </div>

          <div className="rounded-2xl border bg-background p-5 text-left">
            <div className="mb-3 flex items-center gap-2 font-semibold">
              <Smartphone className="h-5 w-5" /> Android
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Download the native Android app directly (APK ~10 MB):
            </p>
            <a href="/Gender.apk" download className="block w-full">
              <Button variant="hero" size="lg" className="w-full">
                <Download className="mr-2 h-5 w-5" /> Download Android App
              </Button>
            </a>
            <p className="mt-3 text-xs text-muted-foreground">
              After downloading, open the file to install. You may need to enable "Install unknown
              apps" for your browser in Settings.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
