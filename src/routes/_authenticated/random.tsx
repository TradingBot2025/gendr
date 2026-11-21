import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/random")({
  component: () => (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-4xl font-bold">Random video</h1>
      <p className="mt-2 text-muted-foreground">This section is not finished yet.</p>
    </div>
  ),
});
