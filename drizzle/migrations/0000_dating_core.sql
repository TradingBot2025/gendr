
create type public.app_role as enum ('admin','user');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  gender text,
  orientation text,
  birthdate date,
  city text,
  country text,
  bio text,
  verified boolean not null default false,
  banned boolean not null default false,
  created_at timestamptz not null default now()
);
grant select on public.profiles to authenticated;
grant update (display_name, gender, orientation, birthdate, city, country, bio) on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create policy "read own roles" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "profiles readable" on public.profiles for select to authenticated using (true);
create policy "update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)));
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- admin moderation
create or replace function public.admin_set_flags(_target uuid, _verified boolean, _banned boolean)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'not allowed'; end if;
  update public.profiles set verified = _verified, banned = _banned where id = _target;
end; $$;

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  path text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.photos to authenticated;
grant all on public.photos to service_role;
alter table public.photos enable row level security;
create policy "photos readable" on public.photos for select to authenticated using (true);
create policy "own photos insert" on public.photos for insert to authenticated with check (user_id = auth.uid());
create policy "own photos update" on public.photos for update to authenticated using (user_id = auth.uid());
create policy "own photos delete" on public.photos for delete to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

create or replace function public.limit_photos() returns trigger language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.photos where user_id = new.user_id) >= 6 then
    raise exception 'Maximum 6 photos allowed';
  end if;
  return new;
end; $$;
create trigger photos_limit before insert on public.photos for each row execute function public.limit_photos();

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references public.profiles(id) on delete cascade,
  addressee uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  check (requester <> addressee)
);
create unique index connections_pair on public.connections (least(requester,addressee), greatest(requester,addressee));
grant select, insert, update, delete on public.connections to authenticated;
grant all on public.connections to service_role;
alter table public.connections enable row level security;
create policy "see own connections" on public.connections for select to authenticated using (auth.uid() in (requester, addressee));
create policy "send request" on public.connections for insert to authenticated with check (requester = auth.uid() and status = 'pending');
create policy "respond request" on public.connections for update to authenticated using (addressee = auth.uid()) with check (addressee = auth.uid());
create policy "remove connection" on public.connections for delete to authenticated using (auth.uid() in (requester, addressee));

create or replace function public.is_connected(_conn uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.connections where id = _conn and status = 'accepted' and auth.uid() in (requester, addressee))
$$;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections(id) on delete cascade,
  sender uuid not null references public.profiles(id) on delete cascade,
  body text,
  attachment_path text,
  attachment_type text,
  attachment_name text,
  created_at timestamptz not null default now()
);
grant select, insert on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;
create policy "read messages" on public.messages for select to authenticated using (public.is_connected(connection_id));
create policy "send messages" on public.messages for insert to authenticated with check (sender = auth.uid() and public.is_connected(connection_id));

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.connections;

-- storage
create policy "photos read" on storage.objects for select to authenticated using (bucket_id = 'photos');
create policy "photos write own" on storage.objects for insert to authenticated with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos delete own" on storage.objects for delete to authenticated using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "attachments read" on storage.objects for select to authenticated using (bucket_id = 'attachments' and public.is_connected(((storage.foldername(name))[1])::uuid));
create policy "attachments write" on storage.objects for insert to authenticated with check (bucket_id = 'attachments' and public.is_connected(((storage.foldername(name))[1])::uuid));
