-- Expiring photos in messages (one-time view / limited views)
-- Adds view tracking to message attachments

alter table public.messages add column if not exists view_count int not null default 0;
alter table public.messages add column if not exists max_views int; -- null = unlimited, 1 = one-time view, >1 = limited views
alter table public.messages add column if not exists attachment_viewed_at timestamptz; -- when the attachment was last viewed

-- Index for cleanup queries
create index if not exists messages_expires_at_idx on public.messages(expires_at) where expires_at is not null;

-- Function to increment view count and check if attachment should be hidden
create or replace function public.increment_message_view(message_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_max_views int;
  v_view_count int;
begin
  select max_views, view_count into v_max_views, v_view_count
  from public.messages
  where id = message_id;
  
  if v_max_views is null then
    return true; -- unlimited views
  end if;
  
  if v_view_count >= v_max_views then
    return false; -- already exceeded max views
  end if;
  
  update public.messages
  set view_count = view_count + 1, attachment_viewed_at = now()
  where id = message_id;
  
  return true;
end; $$;

-- Policy: users can update view_count on messages they can read
create policy "increment view count" on public.messages for update to authenticated
using (
  public.is_connected(connection_id)
  and auth.uid() in (
    select requester from public.connections where id = connection_id
    union
    select addressee from public.connections where id = connection_id
  )
)
with check (
  public.is_connected(connection_id)
  and auth.uid() in (
    select requester from public.connections where id = connection_id
    union
    select addressee from public.connections where id = connection_id
  )
  and (view_count is not null) -- only allow view_count updates
);