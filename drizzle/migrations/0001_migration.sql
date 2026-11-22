update public.profiles set email = null where email is not null;
comment on column public.profiles.email is 'DEPRECATED: no longer stored; email lives only in auth';

create or replace function public.handle_new_user()
 returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)));
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end; $$;

create or replace function public.admin_set_flags(_target uuid, _verified boolean, _banned boolean)
 returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'not allowed'; end if;
  update public.profiles set verified = (verified and _verified), banned = _banned where id = _target;
end; $$;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select to authenticated
using (id = auth.uid() or banned = false or public.has_role(auth.uid(),'admin'));

drop policy if exists "photos readable" on public.photos;
create policy "photos readable" on public.photos for select to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(),'admin')
  or exists (select 1 from public.profiles p where p.id = photos.user_id and p.banned = false));

drop policy if exists "photos read" on storage.objects;
create policy "photos read" on storage.objects for select to authenticated
using (bucket_id = 'photos' and (
  (storage.foldername(name))[1] = (select auth.uid()::text)
  or exists (select 1 from public.photos ph join public.profiles p on p.id = ph.user_id
             where ph.path = storage.objects.name and p.banned = false)
  or public.has_role((select auth.uid()),'admin')));