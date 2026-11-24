import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgeCheck, MessageCircle, Shuffle, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InstallApp } from "@/components/app/InstallApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Gender — Free dating for every identity" },
      {
        name: "description",
        content:
          "Meet people of every gender and orientation. Verified faces, private chat, voice & video calls, random video. 100% free.",
      },
      { property: "og:title", content: "Gender — Free dating for every identity" },
      {
        property: "og:description",
        content: "Verified profiles, chat, calls and random video — free for everyone.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const features = [
  {
    icon: BadgeCheck,
    title: "AI face-verified",
    text: "Profile photos are verified with AI face matching.",
  },
  {
    icon: MessageCircle,
    title: "Chat after you connect",
    text: "No cold DMs. Messages open once both say yes.",
  },
  { icon: Video, title: "Voice & video calls", text: "Call your matches right from the chat." },
  { icon: Shuffle, title: "Random video", text: "Feeling brave? Meet someone new instantly." },
];

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-2xl font-bold text-primary">Gender</span>
        <Button asChild variant="ghost">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>
      <main className="mx-auto max-w-6xl px-6">
        <section className="grid items-center gap-12 py-16 md:grid-cols-2 md:py-24">
          <div>
            <p className="mb-4 inline-block rounded-full bg-accent px-4 py-1 text-sm font-medium text-accent-foreground">
              Every gender. Every heart. Free.
            </p>
            <h1 className="text-5xl font-bold leading-[1.05] md:text-7xl">
              Love,{" "}
              <span className="bg-gradient-primary bg-clip-text text-transparent">as you are.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg text-muted-foreground">
              A dating space built for all identities — with verified faces, real connections and
              calls when you're ready.
            </p>
            <div className="mt-8 flex gap-3">
              <Button asChild variant="hero" size="lg">
                <Link to="/auth">Join free</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-full">
                <Link to="/auth">I have an account</Link>
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {features.map((f, i) => (
              <div
                key={f.title}
                className={`rounded-3xl border bg-card p-6 shadow-soft ${i % 2 ? "translate-y-8" : ""}`}
              >
                <f.icon className="mb-4 h-8 w-8 text-primary" />
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-8">
          <InstallApp variant="section" />
        </section>
      </main>
    </div>
  );
}
