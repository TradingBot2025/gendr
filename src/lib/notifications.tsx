import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { useMe } from '@/lib/data';
import { toast } from 'sonner';

const NotificationContext = createContext({ unreadCount: 0 });
export const useNotifications = () => useContext(NotificationContext);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const uid = me?.user.id;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const path = useRouterState({ select: state => state.location.pathname });
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['unread-messages', uid], enabled: !!uid, refetchInterval: 30000,
    queryFn: async () => {
      if (!uid) return 0;
      const { count, error } = await supabase.from('messages').select('id', { count: 'exact', head: true }).neq('sender', uid).is('read_at', null).eq('unsent', false);
      if (error) throw error;
      return count ?? 0;
    },
  });

  useEffect(() => {
    if (!uid) return;
    const update = () => { void supabase.from('profiles').update({ is_online: !document.hidden, last_seen_at: new Date().toISOString() }).eq('id', uid); };
    update();
    const timer = setInterval(update, 60000);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const channel = supabase.channel(`app-alerts-${uid}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async ({ new: message }) => {
        if (message['sender'] === uid) return;
        void qc.invalidateQueries({ queryKey: ['unread-messages'] });
        void qc.invalidateQueries({ queryKey: ['messages'] });
        void qc.invalidateQueries({ queryKey: ['inbox'] });
        const id = String(message['connection_id']);
        if (path === `/chat/${id}`) return;
        const { data: sender } = await supabase.from('profiles').select('display_name').eq('id', String(message['sender'])).maybeSingle();
        toast(sender?.display_name ?? 'New message', { description: String(message['body'] ?? 'Sent an attachment'), action: { label: 'Open', onClick: () => void navigate({ to: '/chat/$id', params: { id } }) }, duration: 8000 });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, ({ new: connection, eventType }) => {
        void qc.invalidateQueries({ queryKey: ['connections'] });
        void qc.invalidateQueries({ queryKey: ['discover'] });
        void qc.invalidateQueries({ queryKey: ['dashboard'] });
        if (eventType === 'INSERT' && connection['addressee'] === uid) toast('New match request', { action: { label: 'View', onClick: () => void navigate({ to: '/connections' }) } });
        if (eventType === 'UPDATE' && connection['requester'] === uid && connection['status'] === 'accepted') toast.success("It's a match!", { action: { label: 'Chat', onClick: () => void navigate({ to: '/chat/$id', params: { id: String(connection['id']) } }) } });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'album_access_requests' }, ({ new: request, eventType }) => {
        void qc.invalidateQueries({ queryKey: ['album-access'] });
        void qc.invalidateQueries({ queryKey: ['profile-view'] });
        if (eventType === 'INSERT' && request['requester_id'] !== uid) toast('Private album access requested', { action: { label: 'Review', onClick: () => void navigate({ to: '/albums' }) } });
        if (eventType === 'UPDATE' && request['requester_id'] === uid && request['status'] === 'approved') toast.success('Private album access approved');
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [uid, path, qc, navigate]);

  return <NotificationContext.Provider value={{ unreadCount }}>{children}</NotificationContext.Provider>;
}
