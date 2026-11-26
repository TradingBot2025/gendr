import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSigned, type Profile } from "@/lib/data";
import { ProfileCard } from "@/components/app/ProfileCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  MessageCircle,
  Flag,
  UserX,
  User,
  UserPlus,
  Loader2,
  MoreHorizontal,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FileText } from "lucide-react";
import { useRef, useState } from "react";

const REPORT_REASONS = [
  {
    value: "spam",
    label: "Spam",
    description: "Unwanted messages, promotional content, or repetitive messaging",
  },
  {
    value: "fraud",
    label: "Fraud/Scam",
    description: "Attempting to deceive for money, personal info, or financial gain",
  },
  {
    value: "money_request",
    label: "Asking for Money",
    description: "Directly or indirectly requesting money, gifts, or financial help",
  },
  {
    value: "fake_profile",
    label: "Fake Profile",
    description: "Using stolen photos, false identity, or misleading information",
  },
  {
    value: "harassment",
    label: "Harassment",
    description: "Threats, abusive language, stalking, or unwanted persistent contact",
  },
  {
    value: "inappropriate_content",
    label: "Inappropriate Content",
    description: "Explicit, offensive, or prohibited content in photos/bio",
  },
  { value: "underage", label: "Underage User", description: "Appears to be under 18 years old" },
  { value: "other", label: "Other", description: "Something not listed here" },
];

export const Route = createFileRoute("/_authenticated/connections")({
  head: () => ({
    meta: [
      { title: "Matches — Gender" },
      { name: "description", content: "Your matches and connection requests." },

      { property: "og:title", content: "Matches — Gender" },
      { property: "og:description", content: "Your matches and connection requests." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Connections,
});

function Connections() {
  const { data: me } = useMe();
  const uid = me?.user.id;
  const qc = useQueryClient();
  // Report dialog state
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [reportProof, setReportProof] = useState<File | null>(null);
  const [reportProofPreview, setReportProofPreview] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [blockAfterReport, setBlockAfterReport] = useState(true);
  const [reportTargetId, setReportTargetId] = useState("");
  const [reportTargetName, setReportTargetName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const { data } = useQuery({
    queryKey: ["connections", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data: conns } = await supabase
        .from("connections")
        .select("*")
        .order("created_at", { ascending: false });
      const ids = (conns ?? []).map((c) => (c.requester === uid ? c.addressee : c.requester));
      const [{ data: profiles }, { data: photos }] = ids.length
        ? await Promise.all([
            supabase
              .from("public_profiles")
              .select(
                "id,username,display_name,gender,orientation,age,city,country,bio,verified,last_seen_at",
              )
              .in("id", ids),
            supabase
              .from("photos")
              .select("user_id,path,position")
              .in("user_id", ids)
              .order("position"),
          ])
        : [{ data: [] }, { data: [] as { user_id: string; path: string }[] }];
      const first: Record<string, string> = {};
      photos?.forEach((p) => {
        if (!first[p.user_id]) first[p.user_id] = p.path;
      });
      return (conns ?? []).flatMap((c) => {
        const pid = c.requester === uid ? c.addressee : c.requester;
        const p = profiles?.find((x) => x.id === pid);
        return p?.id ? [{ c, p: { ...p, id: p.id }, photo: first[pid] }] : [];
      });
    },
  });
  const urls = useSigned(
    "photos",
    (data ?? []).map((d) => d.photo),
  );
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["connections"] });
    qc.invalidateQueries({ queryKey: ["discover"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const respond = async (id: string, status: "accepted" | "declined") => {
    const { error } = await supabase.from("connections").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(status === "accepted" ? "It's a match!" : "Request declined");
      refresh();
    }
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("connections").delete().eq("id", id);
    if (error) toast.error(error.message);
    else refresh();
  };

  const all = data ?? [];
  const groups = {
    matches: all.filter((d) => d.c.status === "accepted"),
    incoming: all.filter((d) => d.c.status === "pending" && d.c.addressee === uid),
    sent: all.filter((d) => d.c.status === "pending" && d.c.requester === uid),
  };
  const grid = (
    items: typeof all,
    action: (d: (typeof all)[number]) => ReactNode,
    empty: string,
    cols = "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
  ) =>
    items.length ? (
      <div className={`grid ${cols} gap-3`}>
        {items.map((d) => {
          const profileUsername =
            d.p.username && d.p.username.trim() !== "" ? d.p.username : d.p.id;
          return (
            <ProfileCard
              key={d.c.id}
              p={d.p}
              photo={d.photo ? urls[d.photo] : undefined}
              action={action(d)}
              compact
              to="/profile/$username"
              toParams={{ username: profileUsername }}
            />
          );
        })}
      </div>
    ) : (
      <p className="py-16 text-center text-muted-foreground">{empty}</p>
    );

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold sm:text-4xl">Matches</h1>
        <Button variant="outline" size="sm" asChild>
          <Link to="/referrals">
            <UserPlus className="h-4 w-4" />
            <span className="ml-2">Refer a friend</span>
          </Link>
        </Button>
      </div>
      <Tabs defaultValue="matches">
        <TabsList className="mb-6">
          <TabsTrigger value="matches">Matches ({groups.matches.length})</TabsTrigger>
          <TabsTrigger value="incoming">Received ({groups.incoming.length})</TabsTrigger>
          <TabsTrigger value="sent">Sent ({groups.sent.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="matches">
          {grid(
            groups.matches,
            (d) => {
              const profileUsername =
                d.p.username && d.p.username.trim() !== "" ? d.p.username : d.p.id;
              return (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem asChild>
                      <Link to="/profile/$username" params={{ username: profileUsername }}>
                        <User className="h-4 w-4 mr-2" /> View Profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setReportTargetId(d.p.id);
                        setReportTargetName(d.p.display_name ?? "Member");
                        setReportOpen(true);
                      }}
                    >
                      <Flag className="h-4 w-4 mr-2 text-destructive" /> Report
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        if (confirm("Unmatch? This will delete the conversation.")) {
                          remove(d.c.id);
                        }
                      }}
                    >
                      <UserX className="h-4 w-4 mr-2 text-destructive" /> Unmatch
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            },
            "No matches yet.",
            "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5",
          )}
        </TabsContent>
        <TabsContent value="incoming">
          {grid(
            groups.incoming,
            (d) => (
              <div className="flex gap-1.5">
                <Button
                  variant="success"
                  size="sm"
                  className="flex-1"
                  onClick={() => respond(d.c.id, "accepted")}
                >
                  Accept
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => respond(d.c.id, "declined")}
                >
                  Decline
                </Button>
              </div>
            ),
            "No new requests.",
          )}
        </TabsContent>
        <TabsContent value="sent">
          {grid(
            groups.sent,
            (d) => (
              <div className="flex gap-1.5">
                <Button variant="secondary" size="sm" disabled className="flex-1">
                  Waiting
                </Button>
                <Button variant="outline" size="sm" onClick={() => remove(d.c.id)}>
                  Cancel
                </Button>
              </div>
            ),
            "You haven't sent any requests.",
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Report {reportTargetName}</DialogTitle>
            <DialogDescription>
              Help keep Gender safe. Reports are anonymous and reviewed by our team.
              {blockAfterReport && " The user will also be blocked from contacting you."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason</Label>
              <Select value={reportReason} onValueChange={setReportReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>
                Details / Proof <span className="text-destructive">*</span>
              </Label>
              <Textarea
                value={reportDescription}
                onChange={(e) => setReportDescription(e.target.value)}
                placeholder="Describe what happened. Include dates, specific messages, or any evidence..."
                rows={4}
                required
              />
              <p className="text-xs text-muted-foreground">
                Be specific. Reports with details are reviewed faster.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Attach Proof (Optional)</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => fileRef.current?.click()}
                  disabled={reporting}
                >
                  <FileText className="h-4 w-4 mr-2" /> Attach screenshot/document
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,text/*,.pdf"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) {
                      toast.error("Proof file must be under 5MB");
                      return;
                    }
                    if (
                      !file.type.startsWith("image/") &&
                      !file.type.startsWith("text/") &&
                      file.type !== "application/pdf"
                    ) {
                      toast.error("Proof must be an image, text file, or PDF");
                      return;
                    }
                    setReportProof(file);
                    if (file.type.startsWith("image/")) {
                      setReportProofPreview(URL.createObjectURL(file));
                    } else {
                      setReportProofPreview(file.name);
                    }
                  }}
                />
              </div>
              {reportProofPreview && (
                <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                  {reportProofPreview.startsWith("blob:") ? (
                    <img
                      src={reportProofPreview}
                      alt="Proof preview"
                      className="h-16 w-auto rounded"
                    />
                  ) : (
                    <span className="text-sm">{reportProofPreview}</span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setReportProof(null);
                      setReportProofPreview(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <Label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={blockAfterReport}
                onChange={(e) => setBlockAfterReport(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm">
                Block this user after reporting (they won't be able to contact you)
              </span>
            </Label>
          </div>
          <div className="flex gap-2 border-t pt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setReportOpen(false)}
              disabled={reporting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={async () => {
                if (!reportReason) {
                  toast.error("Please select a reason");
                  return;
                }
                if (blockAfterReport && !reportDescription.trim()) {
                  toast.error("Please provide details/proof for the report");
                  return;
                }
                if (!uid) return;
                setReporting(true);
                try {
                  const { error } = await supabase.from("reports").insert({
                    reporter_id: uid,
                    reported_id: reportTargetId,
                    reason: reportDescription.trim(),
                    reason_category: reportReason,
                    auto_blocked: blockAfterReport,
                  });
                  if (error) throw error;

                  toast.success("Report submitted" + (blockAfterReport ? " and user blocked" : ""));
                  setReportOpen(false);
                  setReportReason("");
                  setReportDescription("");
                  setReportProof(null);
                  setReportProofPreview(null);
                  if (fileRef.current) fileRef.current.value = "";
                  qc.invalidateQueries({ queryKey: ["discover"] });
                  qc.invalidateQueries({ queryKey: ["connections"] });
                } catch (err) {
                  const message = err instanceof Error ? err.message : String(err);
                  toast.error(message ?? "Failed to submit report");
                } finally {
                  setReporting(false);
                }
              }}
              disabled={reporting || !reportReason}
            >
              {reporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : ""} Submit Report
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
