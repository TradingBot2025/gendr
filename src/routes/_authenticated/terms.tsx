import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/terms")({
  head: () => ({ meta: [{ title: "Terms & Conditions — Gender" }, { name: "description", content: "Gender dating app terms of service and privacy policy." }] }),
  component: Terms,
});

function Terms() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><button>← Back</button></Button>
        <h1 className="text-3xl font-bold">Terms &amp; Conditions</h1>
      </div>
      <p className="text-muted-foreground">Last updated: November 2026</p>

      <section className="rounded-3xl border bg-card p-6 shadow-soft space-y-4">
        <h2 className="text-xl font-semibold">1. Acceptance of terms</h2>
        <p className="text-sm text-muted-foreground">
          By accessing or using Gender, you agree to these Terms and our Privacy Policy. If you do not agree, you may not use the app.
        </p>
      </section>

      <section className="rounded-3xl border bg-card p-6 shadow-soft space-y-4">
        <h2 className="text-xl font-semibold">2. Eligibility</h2>
        <p className="text-sm text-muted-foreground">
          You must be 18 years or older to register and use Gender. Profiles of users under 18 will be removed.
        </p>
      </section>

      <section className="rounded-3xl border bg-card p-6 shadow-soft space-y-4">
        <h2 className="text-xl font-semibold">3. Privacy &amp; data</h2>
        <p className="text-sm text-muted-foreground">
          All chats are end-to-end encrypted and deleted 24 hours after being sent, from both the app and our database. Private albums are visible only to matches you accept. Face verification is used only to issue a verification badge.
        </p>
      </section>

      <section className="rounded-3xl border bg-card p-6 shadow-soft space-y-4">
        <h2 className="text-xl font-semibold">4. Account &amp; conduct</h2>
        <p className="text-sm text-muted-foreground">
          You are responsible for your account and password. You may delete your account at any time from Account settings by confirming your password. Harassment, hate speech, nudity, and impersonation are prohibited and may lead to suspension or deletion by an administrator.
        </p>
      </section>

      <section className="rounded-3xl border bg-card p-6 shadow-soft space-y-4">
        <h2 className="text-xl font-semibold">5. Ads</h2>
        <p className="text-sm text-muted-foreground">
          Advertisements may be shown to logged-in users via third-party ad platforms (e.g. Google). Ad placements are clearly marked.
        </p>
      </section>

      <section className="rounded-3xl border bg-card p-6 shadow-soft space-y-4">
        <h2 className="text-xl font-semibold">6. Termination</h2>
        <p className="text-sm text-muted-foreground">
          We may suspend or terminate accounts that violate these Terms. Terminated accounts and their data are deleted.
        </p>
      </section>

      <div className="pt-4">
        <Button variant="outline" asChild><a href="/account">Back to account</a></Button>
      </div>
    </div>
  );
}
