import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Flag, Lock, MapPin, MessageCircle, Heart, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { ageOf, useMe, useSigned, logProfileView, reportProfile } from '@/lib/data';
import { canViewPrivateAlbum, coverPhoto } from '@/lib/photo-visibility';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PhotoViewer } from '@/components/app/PhotoViewer';

export const Route = createFileRoute('/_authenticated/profile/$username')({
  head: () => ({ meta: [{ title: 'Member profile — Gender' }, { name: 'description', content: 'Meet a Gender member and see their interests and dating preferences.' }, { property: 'og:title', content: 'Member profile — Gender' }, { property: 'og:description', content: 'Meet a Gender member and see their interests and dating preferences.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  component: ProfileView,
});

function ProfileView() {
  const { username } = Route.useParams();
  const { data: me } = useMe();
  const uid = me?.user.id;
  const qc = useQueryClient();
  const [index, setIndex] = useState(0);
  const [viewer, setViewer] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ['profile-view', username, uid], enabled: !!uid,
    queryFn: async () => {
      const isId = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(username);
      const { data: profile, error } = await supabase.from('profiles').select('id,display_name,username,gender,orientation,birthdate,city,country,bio,looking_for,verified,is_online,last_seen_at').eq(isId ? 'id' : 'username', username).maybeSingle();
      if (error) throw error;
      if (!profile) return null;
      const [photos, albums, connections, requests] = await Promise.all([
        supabase.from('photos').select('*').eq('user_id', profile.id).order('position'),
        supabase.from('photo_albums').select('*').eq('user_id', profile.id),
        supabase.from('connections').select('*'),
        supabase.from('album_access_requests').select('*').eq('requester_id', uid ?? ''),
      ]);
      for (const result of [photos, albums, connections, requests]) if (result.error) throw result.error;
      return { profile, photos: photos.data ?? [], albums: albums.data ?? [], connections: connections.data ?? [], requests: requests.data ?? [] };
    },
  });
  useEffect(() => { if (data?.profile.id && uid && data.profile.id !== uid) void logProfileView(data.profile.id).catch(() => {}); }, [data?.profile.id, uid]);
  const approved = (albumId: string | null) => !!data && !!uid && canViewPrivateAlbum(data.profile.id, uid, data.requests.find(r => r.album_id === albumId)?.status);
  const visible = (data?.photos ?? []).filter(photo => !photo.is_private || approved(photo.album_id));
  const originals = useSigned('photos', visible.map(photo => photo.path));
  const previews = useSigned('photo-previews', (data?.photos ?? []).map(photo => photo.preview_path));
  const cover = coverPhoto(data?.photos ?? []);
  if (isLoading) return <p className="p-8 text-muted-foreground">Loading profile…</p>;
  if (error) return <p className="p-8 text-destructive">Could not load this profile. Please try again.</p>;
  if (!data || !uid) return <p className="p-8 text-muted-foreground">Profile not found.</p>;
  const p = data.profile;
  const connection = data.connections.find(c => (c.requester === uid && c.addressee === p.id) || (c.addressee === uid && c.requester === p.id));
  const mainPhotos = visible.filter(photo => !photo.album_id);
  const main = mainPhotos[index % Math.max(mainPhotos.length, 1)];
  const image = main ? originals[main.path] : cover.path ? (cover.blurred ? previews[cover.path] : originals[cover.path]) : undefined;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['profile-view'] }); void qc.invalidateQueries({ queryKey: ['connections'] }); void qc.invalidateQueries({ queryKey: ['discover'] }); };
  const connect = async () => {
    setBusy(true);
    const { error } = await supabase.from('connections').insert({ requester: uid, addressee: p.id });
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success('Match request sent'); refresh(); }
  };
  const respond = async (status: 'accepted' | 'declined') => {
    if (!connection) return;
    const { error } = await supabase.from('connections').update({ status }).eq('id', connection.id);
    if (error) toast.error(error.message); else { toast.success(status === 'accepted' ? "It's a match!" : 'Request declined'); refresh(); }
  };
  const requestAccess = async (albumId: string) => {
    const { error } = await supabase.from('album_access_requests').insert({ album_id: albumId, requester_id: uid });
    if (error) toast.error(error.message); else { toast.success('Album access requested'); refresh(); }
  };
  const viewerPhotos = viewer === 'main' ? mainPhotos : visible.filter(photo => photo.album_id === viewer);
  return <div className="mx-auto max-w-4xl space-y-8 p-4 md:p-8">
    <div className="grid gap-6 md:grid-cols-2">
      <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-muted">
        <img src={image ?? '/profile-placeholder.svg'} alt={main ? `${p.display_name}'s photo` : 'Private profile preview'} className="h-full w-full object-cover" />
        {main ? <Button variant="ghost" className="absolute inset-0 h-full w-full" aria-label="Open profile photo" onClick={() => setViewer('main')} /> : cover.blurred && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-stage/30 text-stage-foreground"><Lock className="h-10 w-10" /><span>Private photos</span></div>}
        {mainPhotos.length > 1 && <div className="absolute inset-x-3 bottom-3 flex justify-between"><Button size="icon" variant="secondary" aria-label="Previous photo" onClick={() => setIndex(i => (i - 1 + mainPhotos.length) % mainPhotos.length)}><ChevronLeft /></Button><Button size="icon" variant="secondary" aria-label="Next photo" onClick={() => setIndex(i => (i + 1) % mainPhotos.length)}><ChevronRight /></Button></div>}
      </div>
      <section className="space-y-5 py-3">
        <div><h1 className="flex flex-wrap items-center gap-2 text-3xl font-bold">{p.display_name ?? 'Member'}{ageOf(p.birthdate) !== null && <span className="font-normal">, {ageOf(p.birthdate)}</span>}{p.verified && <BadgeCheck className="text-primary" />}</h1><p className="mt-2 flex items-center gap-1 text-muted-foreground"><MapPin className="h-4 w-4" />{[p.city, p.country].filter(Boolean).join(', ') || 'Location not added'}</p></div>
        <div className="flex flex-wrap gap-2">{[p.gender,p.orientation].filter(Boolean).map(value => <span key={value} className="rounded-full bg-accent px-3 py-1 text-sm text-accent-foreground">{value}</span>)}</div>
        <div><h2 className="mb-2 font-semibold">About me</h2><p className="whitespace-pre-wrap break-words text-muted-foreground">{p.bio || 'No introduction added yet.'}</p></div>
        <div><h2 className="mb-2 flex items-center gap-2 font-semibold"><Heart className="h-4 w-4" />Looking for</h2><p className="whitespace-pre-wrap break-words text-muted-foreground">{p.looking_for || 'Dating preferences not added yet.'}</p></div>
        {p.id === uid ? <Button asChild><Link to="/profile">Edit my profile</Link></Button> : <div className="flex flex-wrap gap-2">
          {connection?.status === 'accepted' ? <Button asChild><Link to="/chat/$id" params={{ id: connection.id }}><MessageCircle />Message</Link></Button> : connection?.status === 'pending' ? connection.requester === uid ? <Button disabled variant="secondary">Request pending</Button> : <><Button onClick={() => respond('accepted')}>Accept match</Button><Button variant="outline" onClick={() => respond('declined')}>Decline</Button></> : connection?.status === 'declined' ? <Button disabled variant="secondary">Request declined</Button> : <Button disabled={busy} onClick={connect}><Heart />Connect</Button>}
          <Button variant="outline" size="icon" aria-label="Report member" onClick={() => setReportOpen(true)}><Flag /></Button>
        </div>}
      </section>
    </div>
    <section><h2 className="mb-4 text-2xl font-bold">Albums</h2>{!data.albums.length && <p className="text-muted-foreground">No albums added.</p>}<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.albums.map(album => {
      const photos = data.photos.filter(photo => photo.album_id === album.id);
      const first = photos[0];
      const unlocked = !album.is_private || approved(album.id);
      const request = data.requests.find(r => r.album_id === album.id);
      const photoUrl = first ? unlocked ? originals[first.path] : first.preview_path ? previews[first.preview_path] : undefined : undefined;
      return <article key={album.id} className="overflow-hidden rounded-lg border bg-card">
        <div className="relative aspect-[4/5] bg-muted"><img src={photoUrl ?? '/profile-placeholder.svg'} alt={unlocked ? album.name : 'Blurred private album preview'} className="h-full w-full object-cover" />{!unlocked && <div className="absolute inset-0 flex items-center justify-center bg-stage/20 text-stage-foreground"><Lock className="h-10 w-10" /></div>}{unlocked && photos.length > 0 && <Button variant="ghost" className="absolute inset-0 h-full w-full" aria-label={`Open ${album.name}`} onClick={() => setViewer(album.id)} />}</div>
        <div className="space-y-2 p-4"><h3 className="font-semibold">{album.name}</h3><p className="text-sm text-muted-foreground">{photos.length} photos · {album.is_private ? 'Private' : 'Public'}</p>{!unlocked && (request ? <p className="text-sm text-muted-foreground">{request.status === 'pending' ? 'Access requested' : 'Access declined'}</p> : <Button variant="outline" className="w-full" onClick={() => requestAccess(album.id)}><Lock />Request access</Button>)}</div>
      </article>;
    })}</div></section>
    <PhotoViewer isOpen={!!viewer} onClose={() => setViewer(null)} photos={viewerPhotos} urls={originals} initialIndex={viewer === 'main' ? index : 0} />
    <Dialog open={reportOpen} onOpenChange={setReportOpen}><DialogContent><DialogHeader><DialogTitle>Report {p.display_name}</DialogTitle><DialogDescription>Describe your concern for the moderation team.</DialogDescription></DialogHeader><Textarea aria-label="Report details" value={reason} onChange={e => setReason(e.target.value)} /><Button disabled={!reason.trim() || busy} onClick={async () => { setBusy(true); try { await reportProfile(p.id,reason.trim()); toast.success('Report submitted'); setReportOpen(false); } catch { toast.error('Could not send report'); } finally { setBusy(false); } }}>Submit report</Button></DialogContent></Dialog>
  </div>;
}
