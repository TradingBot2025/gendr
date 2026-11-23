import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSigned, type Profile } from "@/lib/data";
import { ProfileCard } from "@/components/app/ProfileCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({
    meta: [
      { title: "Messages — Gender" },
      { name: "description", content: "Your conversations with matches." },
    ],
  }),
  component: Messages,
});

function Messages() {
  const { data: me } = useMe();
  const uid = me?.user.id;
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["inbox", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data: conns } = await supabase
        .from("connections")
        .select("*")
        .eq("status", "accepted");
      if (!conns?.length) return [];

      const myConns = conns.filter((c) => c.requester === uid || c.addressee === uid);
      if (!myConns.length) return [];

      const otherIds = myConns.map((c) => (c.requester === uid ? c.addressee : c.requester));

      const [{ data: profiles }, { data: messages }, { data: photos }] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id,username,display_name,gender,orientation,birthdate,city,country,bio,verified,last_seen_at",
          )
          .in("id", otherIds),
        supabase
          .from("messages")
          .select("*")
          .in(
            "connection_id",
            myConns.map((c) => c.id),
          )
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("photos")
          .select("user_id,path,position")
          .in("user_id", otherIds)
          .order("position"),
      ]);

      const firstPhoto: Record<string, string> = {};
      photos?.forEach((p) => {
        if (!firstPhoto[p.user_id]) firstPhoto[p.user_id] = p.path;
      });

      const latestMsg: Record<string, (typeof messages)[0]> = {};
      messages?.forEach((m) => {
        if (!latestMsg[m.connection_id]) latestMsg[m.connection_id] = m;
      });

      return myConns
        .map((c) => {
          const pid = c.requester === uid ? c.addressee : c.requester;
          const profile = profiles?.find((p) => p.id === pid);
          const msg = latestMsg[c.id];
          return { connection: c, profile, lastMessage: msg, photo: firstPhoto[pid] };
        })
        .filter((x) => x.profile);
    },
  });

  const urls = useSigned(
    "photos",
    (data ?? []).map((d) => d.photo),
  );

  if (!me) return null;
  if (isLoading)
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <h1 className="mb-6 text-4xl font-bold">Messages</h1>

      {data && data.length === 0 ? (
        <div className="rounded-3xl border bg-card p-12 text-center">
          <MessageCircle className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold">No conversations yet</h2>
          <p className="mt-2 text-muted-foreground">
            Connect with someone on Discover to start chatting.
          </p>
          <Button asChild className="mt-6">
            <Link to="/discover">Discover people</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data?.map((d) => {
            const profileUsername =
              d.profile.username && d.profile.username.trim() !== ""
                ? d.profile.username
                : d.profile.id;
            return (
              <Link
                key={d.connection.id}
                to="/chat/$id"
                params={{ id: d.connection.id }}
                className="block"
              >
                <ProfileCard
                  p={d.profile}
                  photo={d.photo ? urls[d.photo] : undefined}
                  action={
                    <div className="flex items-center justify-between">
                      {d.lastMessage && (
                        <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                          {d.lastMessage.body ??
                            (d.lastMessage.attachment_path ? "📎 Attachment" : "")}
                        </span>
                      )}
                      {d.lastMessage && d.lastMessage.sender !== uid && !d.lastMessage.read_at && (
                        <span className="ml-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                          1
                        </span>
                      )}
                    </div>
                  }
                  to="/profile/$username"
                  toParams={{ username: profileUsername }}
                />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
