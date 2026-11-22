-- Gender app feature extension migration
-- Adds: profile views, private albums, reports, admin actions, referrals, ad placements,
--       online status, 24-hour message expiration, disappearing photos.

-- 1. Online / last-seen status on profiles (for "all online" filter & location auto on register)
alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists latitude double precision;
alter table public.profiles add column if not exists longitude double precision;

-- 2. Profile views (who viewed my profile)
create table if not exists public.profile_views (
  id uuid primary key default gen_random_uuid(),
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (viewer_id <> viewed_id)
);
create index if not exists profile_views_viewed_idx on public.profile_views(viewed_id, created_at desc);
create index if not exists profile_views_viewer_idx on public.profile_views(viewer_id);
grant select, insert on public.profile_views to authenticated;
grant all on public.profile_views to service_role;
alter table public.profile_views enable row level security;
create policy "profile views readable" on public.profile_views for select to authenticated
  using (viewed_id = auth.uid() or viewer_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "log own profile view" on public.profile_views for insert to authenticated
  with check (viewer_id = auth.uid());

-- 3. Photo albums (private albums)
create table if not exists public.photo_albums (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'Private album',
  is_private boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.photo_albums to authenticated;
grant all on public.photo_albums to service_role;
alter table public.photo_albums enable row level security;
create policy "albums readable" on public.photo_albums for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own albums insert" on public.photo_albums for insert to authenticated with check (user_id = auth.uid());
create policy "own albums update" on public.photo_albums for update to authenticated using (user_id = auth.uid());
create policy "own albums delete" on public.photo_albums for delete to authenticated using (user_id = auth.uid());

-- 4. Extend photos: album link, privacy, disappearing timer
alter table public.photos add column if not exists album_id uuid references public.photo_albums(id) on delete set null;
alter table public.photos add column if not exists is_private boolean not null default false;
alter table public.photos add column if not exists view_timer text not null default 'normal' check (view_timer in ('normal','10s','15s'));
create index if not exists photos_album_idx on public.photos(album_id);

-- Update photos read policy to respect private albums & matched-only visibility
drop policy if exists "photos readable" on public.photos;
create policy "photos readable" on public.photos for select to authenticated
using (
  user_id = auth.uid()
  or public.has_role(auth.uid(),'admin')
  or exists (
    select 1 from public.profiles p where p.id = photos.user_id and p.banned = false
    and (
      photos.is_private = false
      or photos.album_id is null
      or exists (
        select 1 from public.connections c
        where c.status = 'accepted'
          and ((c.requester = auth.uid() and c.addressee = photos.user_id)
               or (c.addressee = auth.uid() and c.requester = photos.user_id))
          and (photos.album_id is null or exists (
            select 1 from public.photo_albums a where a.id = photos.album_id and a.user_id = photos.user_id and a.is_private = true
          ))
      )
    )
  )
);

-- 5. Reports (users report profiles; admin reviews)
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  status text not null default 'open' check (status in ('open','reviewed','banned','dismissed')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  check (reporter_id <> reported_id)
);
create index if not exists reports_reported_idx on public.reports(reported_id, created_at desc);
create index if not exists reports_status_idx on public.reports(status);
grant select, insert on public.reports to authenticated;
grant all on public.reports to service_role;
alter table public.reports enable row level security;
create policy "reports readable" on public.reports for select to authenticated
  using (reporter_id = auth.uid() or reported_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "file own report" on public.reports for insert to authenticated with check (reporter_id = auth.uid());

-- 6. Admin actions (track bans, unbans, verifications)
create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  action_type text not null check (action_type in ('ban','unban','verify','unverify','delete')),
  details text,
  created_at timestamptz not null default now()
);
create index if not exists admin_actions_admin_idx on public.admin_actions(admin_id, created_at desc);
grant select, insert on public.admin_actions to authenticated;
grant all on public.admin_actions to service_role;
alter table public.admin_actions enable row level security;
create policy "admin actions readable" on public.admin_actions for select to authenticated
  using (public.has_role(auth.uid(),'admin') or admin_id = auth.uid());
create policy "admin actions insert" on public.admin_actions for insert to authenticated
  with check (public.has_role(auth.uid(),'admin'));

-- 7. Referrals (Kinder-like invite program)
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referee_id uuid references public.profiles(id) on delete set null,
  code text not null unique,
  status text not null default 'pending' check (status in ('pending','completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists referrals_referrer_idx on public.referrals(referrer_id);
create index if not exists referrals_code_idx on public.referrals(code);
grant select, insert on public.referrals to authenticated;
grant all on public.referrals to service_role;
alter table public.referrals enable row level security;
create policy "referrals readable" on public.referrals for select to authenticated
  using (referrer_id = auth.uid() or referee_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own referrals insert" on public.referrals for insert to authenticated with check (referrer_id = auth.uid());

-- 8. Ad placements (space for Google/other ads when logged in)
create table if not exists public.ads_placements (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position text not null default 'bottom',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.ads_placements to authenticated;
grant all on public.ads_placements to service_role;
alter table public.ads_placements enable row level security;
create policy "ads readable" on public.ads_placements for select to authenticated using (true);

-- 9. 24-hour message expiration
alter table public.messages add column if not exists expires_at timestamptz;

-- backfill: existing messages expire 24h after created_at
update public.messages set expires_at = created_at + interval '24 hours' where expires_at is null;

-- Realtime publication for new tables
alter publication supabase_realtime add table public.profile_views;
alter publication supabase_realtime add table public.reports;
alter publication supabase_realtime add table public.messages;
