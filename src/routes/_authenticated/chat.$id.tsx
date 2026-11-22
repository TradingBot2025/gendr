import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, FileText, Paperclip, Phone, Send, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSigned } from "@/lib/data";
import { useCall } from "@/lib/calls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/chat/$id")({
  head: () => ({ meta: [{ title: "Chat — Gender" }, { name: "description", content: "Chat, share and call your match." }] }),
  component: Chat,
});

function Chat() {
  const { id } = Route.useParams();
  const { data: me } = useMe();
  const uid = me?.user.id;
  const call = useCall();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const { data: info } = useQuery({
    queryKey: ["chat-info", id],
    enabled: !!uid,
    queryFn: async () => {
      const { data: c } = await supabase.from("connections").select("*").eq("id", id).maybeSingle();
      if (!c || c.status !== "accepted") return null;
      const pid = c.requester === uid ? c.addressee : c.requester;
      const [{ data: p }, { data: ph }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", pid).maybeSingle(),
        supabase.from("photos").select("path").eq("user_id", pid).order("position").limit(1),
      ]);
      return { pid, peer: p, photo: ph?.[0]?.path };
    },
  });
  const { data: msgs } = useQuery({
    queryKey: ["messages", id],
    enabled: !!info,
    refetchInterval: 2500,
    queryFn: async () => (await supabase.from("messages").select("*").eq("connection_id", id).order("created_at").limit(500)).data ?? [],
  });
  const purls = useSigned("photos", [info?.photo]);
  const aurls = useSigned("attachments", (msgs ?? []).map((m) => m.attachment_path));
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs?.length]);

  if (info === null) return (
    <div className="p-8 text-center"><p className="text-muted-foreground">This chat isn't available.</p><Button asChild className="mt-4"><Link to="/connections">Back to matches</Link></Button></div>
  );
  if (!info || !uid) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  const name = info.peer?.display_name ?? "Match";

  const sendMsg = async (fields: { body?: string; attachment_path?: string; attachment_type?: string; attachment_name?: string }) => {
    const { error } = await supabase.from("messages").insert({ connection_id: id, sender: uid, ...fields });
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["messages", id] });
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const b = text.trim().slice(0, 4000);
    if (!b) return;
    setText(""); setSending(true); await sendMsg({ body: b }); setSending(false);
  };
  const attach = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) { toast.error("Files must be under 25MB"); return; }
    setSending(true);
    const path = `${id}/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage.from("attachments").upload(path, f, { contentType: f.type });
    if (error) toast.error(error.message);
    else await sendMsg({ attachment_path: path, attachment_type: f.type || "application/octet-stream", attachment_name: f.name });
    setSending(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b bg-card p-3">
        <Button asChild size="icon" variant="ghost"><Link to="/connections" aria-label="Back"><ArrowLeft /></Link></Button>
        <div className="h-10 w-10 overflow-hidden rounded-full bg-muted">
          {info.photo && purls[info.photo] ? <img src={purls[info.photo]} alt={name} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center">{name[0]}</span>}
        </div>
        <div className="flex-1 font-semibold">{name}</div>
        <Button size="icon" variant="ghost" onClick={() => call.start(info.pid, name, false)} aria-label="Voice call"><Phone /></Button>
        <Button size="icon" variant="ghost" onClick={() => call.start(info.pid, name, true)} aria-label="Video call"><Video /></Button>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto bg-muted/40 p-4">
        {!msgs?.length && <p className="py-10 text-center text-muted-foreground">Say hi to {name} 👋</p>}
        {msgs?.map((m) => {
          const mine = m.sender === uid;
          const url = m.attachment_path ? aurls[m.attachment_path] : undefined;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-soft ${mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-card"}`}>
                {m.attachment_path && (
                  m.attachment_type?.startsWith("image/") ? (url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={m.attachment_name ?? "image"} className="mb-1 max-h-64 rounded-xl" /></a> : <div className="h-32 w-48 animate-pulse rounded-xl bg-muted" />)
                  : m.attachment_type?.startsWith("video/") ? (url && <video src={url} controls className="mb-1 max-h-64 rounded-xl" />)
                  : <a href={url} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-2 underline"><FileText className="h-4 w-4" />{m.attachment_name}</a>
                )}
                {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                <div className="mt-0.5 text-right text-[10px] opacity-70">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <form onSubmit={submit} className="flex items-center gap-2 border-t bg-card p-3">
        <Button type="button" size="icon" variant="ghost" onClick={() => fileRef.current?.click()} disabled={sending} aria-label="Attach file"><Paperclip /></Button>
        <input ref={fileRef} type="file" hidden onChange={(e) => attach(e.target.files?.[0])} />
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message" maxLength={4000} />
        <Button type="submit" size="icon" disabled={sending || !text.trim()} aria-label="Send"><Send /></Button>
      </form>
    </div>
  );
}
