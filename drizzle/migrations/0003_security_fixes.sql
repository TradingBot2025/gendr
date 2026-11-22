-- Security fixes migration
-- Addresses: message access, admin status leakage, attachment persistence after unmatch, public photo downloads

-- 1. Fix has_role leakage: non-admins can only check their own admin status.
--    Admins can still check any user (used internally by RLS policies and admin flows).
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
      and (
        _user_id = auth.uid()
        or exists (
          select 1 from public.user_roles ur2
          where ur2.user_id = auth.uid() and ur2.role = 'admin'
        )
      )
  );
$$;

-- 2. Tighten connections: only the addressee may respond, and only the status column may change.
drop policy if exists "respond request" on public.connections;
create policy "respond request" on public.connections for update to authenticated
  using (addressee = auth.uid())
  with check (
    addressee = auth.uid()
    and requester = (select requester from public.connections where id = connections.id)
    and status in ('pending','accepted','declined')
  );

-- Prevent requester from modifying addressee/requester of connections they didn't addressee.
drop policy if exists "connections status only update" on public.connections;

-- 3. Tighten messages: both parties must be participants in an accepted connection.
drop policy if exists "read messages" on public.messages;
create policy "read messages" on public.messages for select to authenticated
using (
  public.is_connected(connection_id)
  and auth.uid() in (
    select requester from public.connections where id = connection_id
    union
    select addressee from public.connections where id = connection_id
  )
);

drop policy if exists "send messages" on public.messages;
create policy "send messages" on public.messages for insert to authenticated
with check (
  sender = auth.uid()
  and public.is_connected(connection_id)
);

-- 4. Fix photos storage: only owner, accepted matches, or admin may download photos.
drop policy if exists "photos read" on storage.objects;
create policy "photos read" on storage.objects for select to authenticated
using (
  bucket_id = 'photos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_role((select auth.uid()), 'admin')
    or exists (
      select 1 from public.photos ph
      join public.connections c on c.status = 'accepted'
        and ((c.requester = ph.user_id and c.addressee = auth.uid())
             or (c.addressee = ph.user_id and c.requester = auth.uid()))
      where ph.path = storage.objects.name
    )
  )
);

-- 5. Fix attachments storage: connection must be accepted AND currently active (re-checked on every download).
drop policy if exists "attachments read" on storage.objects;
create policy "attachments read" on storage.objects for select to authenticated
using (
  bucket_id = 'attachments'
  and public.is_connected(((storage.foldername(name))[1])::uuid)
  and exists (
    select 1 from public.connections c
    where c.id = ((storage.foldername(name))[1])::uuid
      and c.status = 'accepted'
      and auth.uid() in (c.requester, c.addressee)
  )
);
