-- Enhanced reports system with categories, proof, and auto-block

-- Add report reason categories and proof fields
alter table public.reports add column if not exists reason_category text check (reason_category in ('spam','fraud','money_request','fake_profile','harassment','inappropriate_content','underage','other'));
alter table public.reports add column if not exists proof_text text;
alter table public.reports add column if not exists proof_file_path text;
alter table public.reports add column if not exists auto_blocked boolean not null default false;

-- Index for faster queries
create index if not exists reports_reason_category_idx on public.reports(reason_category);
create index if not exists reports_auto_blocked_idx on public.reports(auto_blocked);

-- Function to auto-block user when reported with auto_block flag
create or replace function public.auto_block_reported_user(_reporter_id uuid, _reported_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Decline any pending connection between them
  update public.connections
  set status = 'declined'
  where (
    (requester = _reporter_id and addressee = _reported_id)
    or (requester = _reported_id and addressee = _reporter_id)
  ) and status = 'pending';

  -- If they are already connected (accepted), decline it
  update public.connections
  set status = 'declined'
  where (
    (requester = _reporter_id and addressee = _reported_id)
    or (requester = _reported_id and addressee = _reporter_id)
  ) and status = 'accepted';
end; $$;

-- Trigger function to run auto_block when report is inserted with auto_blocked=true
create or replace function public.handle_report_auto_block()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.auto_blocked then
    perform public.auto_block_reported_user(NEW.reporter_id, NEW.reported_id);
  end if;
  return NEW;
end; $$;

-- Create trigger for auto-block
drop trigger if exists trigger_report_auto_block on public.reports;
create trigger trigger_report_auto_block
  after insert on public.reports
  for each row
  execute function public.handle_report_auto_block();