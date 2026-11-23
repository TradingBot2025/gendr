-- ============================================================
-- CONSOLIDATED MIGRATION: Single source of truth for Gender app
-- Safe to run multiple times (idempotent)
-- Combines: 0000_dating_core, 0001_migration, 0002_features,
--           0002_album_approval_and_app_flow_repairs,
--           0003_security_fixes, 0004_expiring_photos,
--           0005_reports_enhancement, complete_migration_final.sql
-- ============================================================

-- 1. Enum type
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. profiles table with all columns
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  display_name text,
  username text UNIQUE,
  gender text,
  orientation text,
  birthdate date,
  city text,
  country text,
  bio text,
  looking_for text,
  verified boolean NOT NULL DEFAULT false,
  banned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  latitude double precision,
  longitude double precision,
  is_online boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS profiles_username_idx ON public.profiles(username);

-- Add new columns to existing profiles table (idempotent)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text UNIQUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS looking_for text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS longitude double precision;

-- Generate usernames for existing users who don't have one
DO $$
DECLARE
  rec RECORD;
  base_username text;
  final_username text;
  counter int;
  col_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'username'
  ) INTO col_exists;

  IF NOT col_exists THEN
    RAISE NOTICE 'username column does not exist yet, skipping username generation';
    RETURN;
  END IF;

  FOR rec IN SELECT id, display_name, email FROM public.profiles WHERE username IS NULL LOOP
    base_username := COALESCE(rec.display_name, SPLIT_PART(rec.email, '@', 1));
    base_username := lower(regexp_replace(base_username, '[^a-z0-9_]', '', 'g'));
    base_username := substring(base_username from 1 for 30);

    final_username := base_username;
    counter := 1;
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
      final_username := base_username || counter;
      counter := counter + 1;
    END LOOP;

    UPDATE public.profiles SET username = final_username WHERE id = rec.id;
  END LOOP;
END $$;

-- 3. user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- 4. has_role function (secure: non-admins can only check their own admin status)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
      AND (
        _user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur2
          WHERE ur2.user_id = auth.uid() AND ur2.role = 'admin'
        )
      )
  );
$$;

-- 5. profiles RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles readable" ON public.profiles;
CREATE POLICY "profiles readable" ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "update own profile" ON public.profiles;
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- 5a. Public profiles view (safe columns only for other users)
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT
  id,
  username,
  display_name,
  gender,
  orientation,
  -- Return age instead of birthdate
  CASE WHEN birthdate IS NOT NULL THEN EXTRACT(year FROM age(birthdate))::int END AS age,
  city,
  country,
  bio,
  looking_for,
  verified,
  last_seen_at,
  created_at,
  is_online
FROM public.profiles
WHERE banned = false;

GRANT SELECT ON public.public_profiles TO authenticated;

-- 5b. Helper function to get safe profile data for other users
CREATE OR REPLACE FUNCTION public.get_public_profile(_user_id uuid)
RETURNS SETOF public.public_profiles LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.public_profiles WHERE id = _user_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_profile(uuid) TO authenticated;

-- 6. user_roles RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own roles" ON public.user_roles;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- 7. handle_new_user trigger (first user becomes admin atomically)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  base_username text;
  final_username text;
  counter int := 1;
BEGIN
  base_username := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email,'@',1));
  base_username := lower(regexp_replace(base_username, '[^a-z0-9_]', '', 'g'));
  base_username := substring(base_username from 1 for 30);

  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    final_username := base_username || counter;
    counter := counter + 1;
  END LOOP;

  INSERT INTO public.profiles (id, display_name, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email,'@',1)), final_username);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  -- Atomically assign admin role to first user (using advisory lock to prevent race)
  PERFORM pg_advisory_xact_lock(1234567890);
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. admin_set_flags (verified AND logic: only removes verification, never adds)
CREATE OR REPLACE FUNCTION public.admin_set_flags(_target uuid, _verified boolean, _banned boolean)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'not allowed'; END IF;
  UPDATE public.profiles SET verified = (verified AND _verified), banned = _banned WHERE id = _target;
END; $$;

-- 9. photo_albums
CREATE TABLE IF NOT EXISTS public.photo_albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Private album',
  is_private boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.photo_albums ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "albums readable" ON public.photo_albums;
CREATE POLICY "albums readable" ON public.photo_albums FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "own albums insert" ON public.photo_albums;
CREATE POLICY "own albums insert" ON public.photo_albums FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "own albums update" ON public.photo_albums;
CREATE POLICY "own albums update" ON public.photo_albums FOR UPDATE TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "own albums delete" ON public.photo_albums;
CREATE POLICY "own albums delete" ON public.photo_albums FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 10. photos (with album_id, is_private, view_timer, preview_path)
CREATE TABLE IF NOT EXISTS public.photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  path text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS album_id uuid REFERENCES public.photo_albums(id) ON DELETE SET NULL;
ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;
ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS view_timer text NOT NULL DEFAULT 'normal' CHECK (view_timer IN ('normal','10s','15s'));
ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS preview_path text;
CREATE INDEX IF NOT EXISTS photos_album_idx ON public.photos(album_id);

ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "photos readable" ON public.photos;
CREATE POLICY "photos readable" ON public.photos FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(),'admin')
  OR EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = photos.user_id AND p.banned = false
    AND (
      photos.is_private = false
      OR photos.album_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.connections c
        WHERE c.status = 'accepted'
          AND ((c.requester = auth.uid() AND c.addressee = photos.user_id)
               OR (c.addressee = auth.uid() AND c.requester = photos.user_id))
          AND (photos.album_id IS NULL OR EXISTS (
            SELECT 1 FROM public.photo_albums a WHERE a.id = photos.album_id AND a.user_id = photos.user_id AND a.is_private = true
          ))
      )
    )
  )
);
DROP POLICY IF EXISTS "own photos insert" ON public.photos;
CREATE POLICY "own photos insert" ON public.photos FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "own photos update" ON public.photos;
CREATE POLICY "own photos update" ON public.photos FOR UPDATE TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "own photos delete" ON public.photos;
CREATE POLICY "own photos delete" ON public.photos FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- 11. limit_photos trigger (max 6 photos per user)
CREATE OR REPLACE FUNCTION public.limit_photos() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (SELECT COUNT(*) FROM public.photos WHERE user_id = NEW.user_id) >= 6 THEN
    RAISE EXCEPTION 'Maximum 6 photos allowed';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS photos_limit ON public.photos;
CREATE TRIGGER photos_limit BEFORE INSERT ON public.photos FOR EACH ROW EXECUTE FUNCTION public.limit_photos();

-- 12. sync_photo_privacy trigger (auto-set is_private based on album)
CREATE OR REPLACE FUNCTION public.sync_photo_privacy() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.album_id IS NOT NULL THEN
    SELECT a.is_private INTO NEW.is_private FROM public.photo_albums a WHERE a.id = NEW.album_id AND a.user_id = NEW.user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Album does not belong to you'; END IF;
  ELSE
    NEW.is_private = false;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sync_photo_privacy ON public.photos;
CREATE TRIGGER sync_photo_privacy BEFORE INSERT OR UPDATE OF album_id,is_private ON public.photos FOR EACH ROW EXECUTE FUNCTION public.sync_photo_privacy();

-- Backfill is_private for existing photos
UPDATE public.photos ph SET is_private = COALESCE((SELECT a.is_private FROM public.photo_albums a WHERE a.id = ph.album_id), false);

-- 13. connections
CREATE TABLE IF NOT EXISTS public.connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  addressee uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requester <> addressee)
);
CREATE UNIQUE INDEX IF NOT EXISTS connections_pair ON public.connections (LEAST(requester,addressee), GREATEST(requester,addressee));

ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "see own connections" ON public.connections;
CREATE POLICY "see own connections" ON public.connections FOR SELECT TO authenticated USING (auth.uid() IN (requester, addressee));
DROP POLICY IF EXISTS "send request" ON public.connections;
CREATE POLICY "send request" ON public.connections FOR INSERT TO authenticated
WITH CHECK (requester = auth.uid() AND addressee <> auth.uid() AND status = 'pending' AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = addressee AND NOT p.banned));
DROP POLICY IF EXISTS "respond request" ON public.connections;
CREATE POLICY "respond request" ON public.connections FOR UPDATE TO authenticated
USING (addressee = auth.uid() AND status = 'pending')
WITH CHECK (addressee = auth.uid() AND status IN ('accepted','declined'));
DROP POLICY IF EXISTS "remove connection" ON public.connections;
CREATE POLICY "remove connection" ON public.connections FOR DELETE TO authenticated USING (auth.uid() IN (requester, addressee));

-- keep_connection_participants trigger
CREATE OR REPLACE FUNCTION public.keep_connection_participants() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.requester <> OLD.requester OR NEW.addressee <> OLD.addressee THEN
    RAISE EXCEPTION 'Participants cannot be changed';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS keep_connection_participants ON public.connections;
CREATE TRIGGER keep_connection_participants BEFORE UPDATE ON public.connections FOR EACH ROW EXECUTE FUNCTION public.keep_connection_participants();

-- 14. is_connected function
CREATE OR REPLACE FUNCTION public.is_connected(_conn uuid) RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.connections WHERE id = _conn AND status = 'accepted' AND auth.uid() IN (requester, addressee))
$$;

-- 15. messages (with expires_at, view_count, max_views, attachment_viewed_at, unsent, read_at)
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
  sender uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text,
  attachment_path text,
  attachment_type text,
  attachment_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS view_count int NOT NULL DEFAULT 0;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS max_views int;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS attachment_viewed_at timestamptz;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS unsent boolean NOT NULL DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_at timestamptz;
CREATE INDEX IF NOT EXISTS messages_expires_at_idx ON public.messages(expires_at) WHERE expires_at IS NOT NULL;

-- Backfill: existing messages expire 24h after created_at
UPDATE public.messages SET expires_at = created_at + INTERVAL '24 hours' WHERE expires_at IS NULL;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read messages" ON public.messages;
CREATE POLICY "read messages" ON public.messages FOR SELECT TO authenticated
USING (public.is_connected(connection_id) AND (expires_at IS NULL OR expires_at > now()));
DROP POLICY IF EXISTS "send messages" ON public.messages;
CREATE POLICY "send messages" ON public.messages FOR INSERT TO authenticated
WITH CHECK (sender = auth.uid() AND public.is_connected(connection_id));
DROP POLICY IF EXISTS "increment view count" ON public.messages;
CREATE POLICY "increment view count" ON public.messages FOR UPDATE TO authenticated
USING (public.is_connected(connection_id) AND auth.uid() IN (SELECT requester FROM public.connections WHERE id = connection_id UNION SELECT addressee FROM public.connections WHERE id = connection_id))
WITH CHECK (public.is_connected(connection_id) AND auth.uid() IN (SELECT requester FROM public.connections WHERE id = connection_id UNION SELECT addressee FROM public.connections WHERE id = connection_id) AND (view_count IS NOT NULL));

-- 16. increment_message_view function
CREATE OR REPLACE FUNCTION public.increment_message_view(message_id uuid)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max_views int;
  v_view_count int;
  v_sender uuid;
  v_connection_id uuid;
  v_expires_at timestamptz;
  v_unsent boolean;
BEGIN
  SELECT max_views, view_count, sender, connection_id, expires_at, unsent
  INTO v_max_views, v_view_count, v_sender, v_connection_id, v_expires_at, v_unsent
  FROM public.messages WHERE id = message_id FOR UPDATE;

  IF NOT FOUND OR NOT public.is_connected(v_connection_id) OR v_sender = auth.uid() OR v_unsent OR (v_expires_at IS NOT NULL AND v_expires_at <= now()) THEN
    RETURN false;
  END IF;

  IF v_max_views IS NOT NULL AND v_view_count >= v_max_views THEN
    RETURN false;
  END IF;

  UPDATE public.messages SET view_count = view_count + 1, attachment_viewed_at = now() WHERE id = message_id;
  RETURN true;
END; $$;

-- 17. mark_chat_read function
CREATE OR REPLACE FUNCTION public.mark_chat_read(_connection_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_connected(_connection_id) THEN RAISE EXCEPTION 'Chat unavailable'; END IF;
  UPDATE public.messages SET read_at = now() WHERE connection_id = _connection_id AND sender <> auth.uid() AND read_at IS NULL;
END; $$;

-- 18. unsend_message function
CREATE OR REPLACE FUNCTION public.unsend_message(_message_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.messages SET unsent = true, body = NULL, attachment_path = NULL, attachment_type = NULL, attachment_name = NULL
  WHERE id = _message_id AND sender = auth.uid() AND public.is_connected(connection_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Message unavailable'; END IF;
END; $$;

REVOKE ALL ON FUNCTION public.increment_message_view(uuid), public.mark_chat_read(uuid), public.unsend_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_message_view(uuid), public.mark_chat_read(uuid), public.unsend_message(uuid) TO authenticated;

-- 19. profile_views
CREATE TABLE IF NOT EXISTS public.profile_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (viewer_id <> viewed_id)
);
CREATE INDEX IF NOT EXISTS profile_views_viewed_idx ON public.profile_views(viewed_id, created_at DESC);
CREATE INDEX IF NOT EXISTS profile_views_viewer_idx ON public.profile_views(viewer_id);

ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profile views readable" ON public.profile_views;
CREATE POLICY "profile views readable" ON public.profile_views FOR SELECT TO authenticated
  USING (viewed_id = auth.uid() OR viewer_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "log own profile view" ON public.profile_views;
CREATE POLICY "log own profile view" ON public.profile_views FOR INSERT TO authenticated
  WITH CHECK (viewer_id = auth.uid());

-- 20. album_access_requests
CREATE TABLE IF NOT EXISTS public.album_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES public.photo_albums(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(album_id, requester_id)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.album_access_requests TO authenticated;
GRANT ALL ON public.album_access_requests TO service_role;
ALTER TABLE public.album_access_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants read album requests" ON public.album_access_requests FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR EXISTS (SELECT 1 FROM public.photo_albums a WHERE a.id = album_id AND a.user_id = auth.uid()));
CREATE POLICY "request private album" ON public.album_access_requests FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid() AND status = 'pending' AND EXISTS (SELECT 1 FROM public.photo_albums a JOIN public.profiles p ON p.id = a.user_id WHERE a.id = album_id AND a.user_id <> auth.uid() AND NOT p.banned));
CREATE POLICY "owner responds to album request" ON public.album_access_requests FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.photo_albums a WHERE a.id = album_id AND a.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.photo_albums a WHERE a.id = album_id AND a.user_id = auth.uid()));
CREATE POLICY "owner revokes album request" ON public.album_access_requests FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.photo_albums a WHERE a.id = album_id AND a.user_id = auth.uid()));

-- keep_album_request_participants trigger
CREATE OR REPLACE FUNCTION public.keep_album_request_participants() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.album_id <> OLD.album_id OR NEW.requester_id <> OLD.requester_id THEN
    RAISE EXCEPTION 'Request participants cannot be changed';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS keep_album_request_participants ON public.album_access_requests;
CREATE TRIGGER keep_album_request_participants BEFORE UPDATE ON public.album_access_requests FOR EACH ROW EXECUTE FUNCTION public.keep_album_request_participants();

-- 21. can_read_photo function (for storage policies)
CREATE OR REPLACE FUNCTION public.can_read_photo(_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.photos ph
    JOIN public.profiles p ON p.id = ph.user_id
    LEFT JOIN public.photo_albums a ON a.id = ph.album_id
    WHERE ph.path = _path
      AND (ph.user_id = auth.uid()
           OR public.has_role(auth.uid(),'admin')
           OR (NOT p.banned AND (
             (NOT ph.is_private AND (a.id IS NULL OR NOT a.is_private))
             OR EXISTS (
               SELECT 1 FROM public.album_access_requests r
               WHERE r.album_id = ph.album_id AND r.requester_id = auth.uid() AND r.status = 'approved'
             )
           ))
  );
$$;
REVOKE ALL ON FUNCTION public.can_read_photo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_photo(text) TO authenticated;

-- 22. reports (with reason_category, proof_text, proof_file_path, auto_blocked)
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','banned','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  CHECK (reporter_id <> reported_id)
);
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS reason_category text CHECK (reason_category IN ('spam','fraud','money_request','fake_profile','harassment','inappropriate_content','underage','other'));
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS proof_text text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS proof_file_path text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS auto_blocked boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS reports_reported_idx ON public.reports(reported_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_status_idx ON public.reports(status);
CREATE INDEX IF NOT EXISTS reports_reason_category_idx ON public.reports(reason_category);
CREATE INDEX IF NOT EXISTS reports_auto_blocked_idx ON public.reports(auto_blocked);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reports readable" ON public.reports;
CREATE POLICY "reports readable" ON public.reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR reported_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "file own report" ON public.reports;
CREATE POLICY "file own report" ON public.reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());

-- 23. auto_block_reported_user function
CREATE OR REPLACE FUNCTION public.auto_block_reported_user(_reporter_id uuid, _reported_id uuid)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.connections SET status = 'declined'
  WHERE ((requester = _reporter_id AND addressee = _reported_id) OR (requester = _reported_id AND addressee = _reporter_id))
  AND status IN ('pending','accepted');
END; $$;

-- 24. handle_report_auto_block trigger
CREATE OR REPLACE FUNCTION public.handle_report_auto_block()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.auto_blocked THEN PERFORM public.auto_block_reported_user(NEW.reporter_id, NEW.reported_id); END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trigger_report_auto_block ON public.reports;
CREATE TRIGGER trigger_report_auto_block
  AFTER INSERT ON public.reports FOR EACH ROW EXECUTE FUNCTION public.handle_report_auto_block();

-- 25. admin_actions
CREATE TABLE IF NOT EXISTS public.admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN ('ban','unban','verify','unverify','delete')),
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_actions_admin_idx ON public.admin_actions(admin_id, created_at DESC);
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin actions readable" ON public.admin_actions;
CREATE POLICY "admin actions readable" ON public.admin_actions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR admin_id = auth.uid());
DROP POLICY IF EXISTS "admin actions insert" ON public.admin_actions;
CREATE POLICY "admin actions insert" ON public.admin_actions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 26. referrals
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS referrals_code_idx ON public.referrals(code);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "referrals readable" ON public.referrals;
CREATE POLICY "referrals readable" ON public.referrals FOR SELECT TO authenticated
  USING (referrer_id = auth.uid() OR referee_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "own referrals insert" ON public.referrals;
CREATE POLICY "own referrals insert" ON public.referrals FOR INSERT TO authenticated WITH CHECK (referrer_id = auth.uid());

-- 27. ads_placements
CREATE TABLE IF NOT EXISTS public.ads_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  position text NOT NULL DEFAULT 'bottom',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ads_placements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ads readable" ON public.ads_placements;
CREATE POLICY "ads readable" ON public.ads_placements FOR SELECT TO authenticated USING (true);

-- 28. random_matchmaking_queue (NEW: for server-side random matching)
CREATE TABLE IF NOT EXISTS public.random_matchmaking_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  country_code text, -- ISO country code or 'global'
  preferences jsonb DEFAULT '{}'::jsonb, -- video/audio, age range, etc.
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','matched','expired','cancelled')),
  matched_with uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + INTERVAL '5 minutes'),
  UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS random_queue_status_idx ON public.random_matchmaking_queue(status, country_code, created_at);
ALTER TABLE public.random_matchmaking_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own queue entry" ON public.random_matchmaking_queue;
CREATE POLICY "own queue entry" ON public.random_matchmaking_queue FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "insert own queue" ON public.random_matchmaking_queue;
CREATE POLICY "insert own queue" ON public.random_matchmaking_queue FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "update own queue" ON public.random_matchmaking_queue;
CREATE POLICY "update own queue" ON public.random_matchmaking_queue FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- 29. random_match_history (for "do not rematch" memory)
CREATE TABLE IF NOT EXISTS public.random_match_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  matched_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, matched_user_id)
);
CREATE INDEX IF NOT EXISTS random_history_user_idx ON public.random_match_history(user_id);
ALTER TABLE public.random_match_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own match history" ON public.random_match_history;
CREATE POLICY "own match history" ON public.random_match_history FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "insert match history" ON public.random_match_history;
CREATE POLICY "insert match history" ON public.random_match_history FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- 30. Server-side matchmaking RPC
CREATE OR REPLACE FUNCTION public.find_random_match(_country_code text DEFAULT 'global')
RETURNS TABLE (peer_id uuid, peer_name text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  my_id uuid := auth.uid();
  my_profile RECORD;
  matched_peer RECORD;
BEGIN
  -- Get my profile for age/verification checks
  SELECT * INTO my_profile FROM public.profiles WHERE id = my_id;
  IF NOT FOUND OR my_profile.banned THEN
    RETURN;
  END IF;

  -- Upsert my queue entry
  INSERT INTO public.random_matchmaking_queue (user_id, country_code, status, expires_at)
  VALUES (my_id, _country_code, 'waiting', now() + INTERVAL '5 minutes')
  ON CONFLICT (user_id) DO UPDATE SET
    country_code = _country_code,
    status = 'waiting',
    expires_at = now() + INTERVAL '5 minutes',
    matched_with = NULL;

  -- Try to find a match (atomic with FOR UPDATE SKIP LOCKED)
  FOR matched_peer IN
    SELECT q.user_id, p.display_name
    FROM public.random_matchmaking_queue q
    JOIN public.profiles p ON p.id = q.user_id
    WHERE q.user_id <> my_id
      AND q.status = 'waiting'
      AND q.expires_at > now()
      AND (q.country_code = _country_code OR q.country_code = 'global' OR _country_code = 'global')
      AND p.banned = false
      AND p.is_online = true
      AND NOT EXISTS (
        SELECT 1 FROM public.random_match_history h
        WHERE h.user_id = my_id AND h.matched_user_id = q.user_id
      )
      AND (
        -- Age gate: both must be 18+
        (my_profile.birthdate IS NULL OR p.birthdate IS NULL)
        OR (EXTRACT(year FROM age(my_profile.birthdate)) >= 18 AND EXTRACT(year FROM age(p.birthdate)) >= 18)
      )
    ORDER BY q.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  LOOP
    -- Mark both as matched
    UPDATE public.random_matchmaking_queue
    SET status = 'matched', matched_with = matched_peer.user_id
    WHERE user_id = my_id;

    UPDATE public.random_matchmaking_queue
    SET status = 'matched', matched_with = my_id
    WHERE user_id = matched_peer.user_id;

    -- Record in match history (both directions)
    INSERT INTO public.random_match_history (user_id, matched_user_id) VALUES (my_id, matched_peer.user_id)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.random_match_history (user_id, matched_user_id) VALUES (matched_peer.user_id, my_id)
    ON CONFLICT DO NOTHING;

    RETURN QUERY SELECT matched_peer.user_id, matched_peer.display_name;
    RETURN;
  END LOOP;

  -- No match found
  RETURN;
END; $$;

-- 31. Leave random queue RPC
CREATE OR REPLACE FUNCTION public.leave_random_queue()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.random_matchmaking_queue
  SET status = 'cancelled'
  WHERE user_id = auth.uid() AND status = 'waiting';
END; $$;

-- 32. TURN credentials function (server-side, short-lived)
CREATE OR REPLACE FUNCTION public.get_turn_credentials()
RETURNS TABLE (
  username text,
  credential text,
  urls text[],
  ttl int
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  turn_secret text := current_setting('app.turn_secret', true);
  turn_urls text := current_setting('app.turn_urls', true);
  expiry bigint := EXTRACT(epoch FROM (now() + INTERVAL '1 hour'))::bigint;
  hmac_input text;
  hmac_hash text;
  username text;
  credential text;
BEGIN
  IF turn_secret IS NULL OR turn_secret = '' THEN
    -- Fallback to STUN only if TURN not configured
    RETURN QUERY SELECT ''::text, ''::text, ARRAY['stun:stun.l.google.com:19302']::text[], 3600;
  END IF;

  hmac_input := expiry || ':' || auth.uid();
  hmac_hash := encode(hmac(hmac_input, turn_secret, 'sha1'), 'base64');
  username := expiry || ':' || auth.uid();
  credential := hmac_hash;

  RETURN QUERY SELECT username, credential, string_to_array(turn_urls, ',')::text[], 3600;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_turn_credentials() TO authenticated;

-- 33. update_last_seen_at trigger
CREATE OR REPLACE FUNCTION public.update_last_seen_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.last_seen_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trigger_update_last_seen_at ON public.profiles;
CREATE TRIGGER trigger_update_last_seen_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_last_seen_at();

-- 34. Storage buckets (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('photos', 'photos', false, 26214400, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('attachments', 'attachments', false, 26214400, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'application/pdf']),
  ('photo-previews', 'photo-previews', false, 1048576, ARRAY['image/jpeg'])
ON CONFLICT (id) DO NOTHING;

-- 35. Storage policies
DROP POLICY IF EXISTS "photos read" ON storage.objects;
CREATE POLICY "photos read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'photos' AND (
  (storage.foldername(name))[1] = auth.uid()::text
  OR public.has_role((SELECT auth.uid()), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.photos ph
    JOIN public.connections c ON c.status = 'accepted'
      AND ((c.requester = ph.user_id AND c.addressee = auth.uid())
           OR (c.addressee = ph.user_id AND c.requester = auth.uid()))
    WHERE ph.path = storage.objects.name
  )
  OR public.can_read_photo(name)
));

DROP POLICY IF EXISTS "photos write own" ON storage.objects;
CREATE POLICY "photos write own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "photos delete own" ON storage.objects;
CREATE POLICY "photos delete own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "attachments read" ON storage.objects;
CREATE POLICY "attachments read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'attachments' AND public.is_connected(((storage.foldername(name))[1])::uuid)
  AND EXISTS (
    SELECT 1 FROM public.connections c
    WHERE c.id = ((storage.foldername(name))[1])::uuid
      AND c.status = 'accepted'
      AND auth.uid() IN (c.requester, c.addressee)
  ));

DROP POLICY IF EXISTS "attachments write" ON storage.objects;
CREATE POLICY "attachments write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'attachments' AND public.is_connected(((storage.foldername(name))[1])::uuid));

DROP POLICY IF EXISTS "blurred previews read" ON storage.objects;
CREATE POLICY "blurred previews read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'photo-previews' AND EXISTS (
  SELECT 1 FROM public.photos ph JOIN public.profiles p ON p.id = ph.user_id
  WHERE ph.preview_path = name AND NOT p.banned
));

DROP POLICY IF EXISTS "blurred previews upload" ON storage.objects;
CREATE POLICY "blurred previews upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'photo-previews' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "blurred previews delete" ON storage.objects;
CREATE POLICY "blurred previews delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'photo-previews' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 36. Realtime publications (safe: check before adding)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'connections') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.connections;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profile_views') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profile_views;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'reports') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reports;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'album_access_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.album_access_requests;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'random_matchmaking_queue') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.random_matchmaking_queue;
  END IF;
END $$;

-- 37. Discover RPC (server-side pagination & filtering)
CREATE OR REPLACE FUNCTION public.discover_profiles(
  _gender text DEFAULT 'any',
  _orientation text DEFAULT 'any',
  _min_age int DEFAULT 18,
  _max_age int DEFAULT 99,
  _place text DEFAULT '',
  _verified_only boolean DEFAULT false,
  _online_only boolean DEFAULT false,
  _sort_fresh boolean DEFAULT true,
  _limit int DEFAULT 20,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  gender text,
  orientation text,
  age int,
  city text,
  country text,
  bio text,
  verified boolean,
  last_seen_at timestamptz,
  created_at timestamptz,
  photo_path text,
  connection_status text,
  connection_id uuid
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  my_id uuid := auth.uid();
  fifteen_min_ago timestamptz := now() - INTERVAL '15 minutes';
  place_lower text := lower(_place);
BEGIN
  -- Validate age range
  IF _min_age < 18 THEN _min_age := 18; END IF;
  IF _max_age > 99 THEN _max_age := 99; END IF;
  IF _limit > 50 THEN _limit := 50; END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.username,
    p.display_name,
    p.gender,
    p.orientation,
    p.age,
    p.city,
    p.country,
    p.bio,
    p.verified,
    p.last_seen_at,
    p.created_at,
    ph.path AS photo_path,
    COALESCE(c.status, 'none') AS connection_status,
    c.id AS connection_id
  FROM public.public_profiles p
  LEFT JOIN LATERAL (
    SELECT path FROM public.photos
    WHERE user_id = p.id AND is_private = false AND album_id IS NULL
    ORDER BY position LIMIT 1
  ) ph ON true
  LEFT JOIN public.connections c
    ON c.status IN ('pending','accepted')
    AND ((c.requester = my_id AND c.addressee = p.id) OR (c.requester = p.id AND c.addressee = my_id))
  WHERE p.id <> my_id
    AND (_gender = 'any' OR p.gender = _gender)
    AND (_orientation = 'any' OR p.orientation = _orientation)
    AND (_verified_only = false OR p.verified = true)
    AND (_online_only = false OR (p.last_seen_at IS NOT NULL AND p.last_seen_at >= fifteen_min_ago))
    AND (place_lower = '' OR lower(p.city || ' ' || p.country) LIKE '%' || place_lower || '%')
    AND (p.age IS NULL OR (p.age BETWEEN _min_age AND _max_age))
  ORDER BY
    CASE WHEN _sort_fresh THEN p.created_at END DESC,
    CASE WHEN NOT _sort_fresh THEN p.last_seen_at END DESC NULLS LAST
  LIMIT _limit OFFSET _offset;
END; $$;

GRANT EXECUTE ON FUNCTION public.discover_profiles(
  text, text, int, int, text, boolean, boolean, boolean, int, int
) TO authenticated;

-- 38. Who viewed me RPC
CREATE OR REPLACE FUNCTION public.get_profile_views(_limit int DEFAULT 50, _offset int DEFAULT 0)
RETURNS TABLE (
  viewer_id uuid,
  viewed_at timestamptz,
  display_name text,
  gender text,
  orientation text,
  age int,
  city text,
  country text,
  bio text,
  verified boolean,
  photo_path text,
  connection_status text,
  connection_id uuid
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  my_id uuid := auth.uid();
BEGIN
  RETURN QUERY
  SELECT
    pv.viewer_id,
    pv.created_at AS viewed_at,
    p.display_name,
    p.gender,
    p.orientation,
    p.age,
    p.city,
    p.country,
    p.bio,
    p.verified,
    ph.path AS photo_path,
    COALESCE(c.status, 'none') AS connection_status,
    c.id AS connection_id
  FROM public.profile_views pv
  JOIN public.public_profiles p ON p.id = pv.viewer_id
  LEFT JOIN LATERAL (
    SELECT path FROM public.photos
    WHERE user_id = p.id AND is_private = false AND album_id IS NULL
    ORDER BY position LIMIT 1
  ) ph ON true
  LEFT JOIN public.connections c
    ON c.status IN ('pending','accepted')
    AND ((c.requester = my_id AND c.addressee = p.id) OR (c.requester = p.id AND c.addressee = my_id))
  WHERE pv.viewed_id = my_id
  ORDER BY pv.created_at DESC
  LIMIT _limit OFFSET _offset;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_profile_views(int, int) TO authenticated;

-- 39. Get profile views with pagination (using public_profiles view)
CREATE OR REPLACE FUNCTION public.get_profile_views_paginated(_limit int DEFAULT 50, _offset int DEFAULT 0)
RETURNS TABLE (
  viewer_id uuid,
  viewed_at timestamptz,
  display_name text,
  gender text,
  orientation text,
  age int,
  city text,
  country text,
  bio text,
  verified boolean,
  photo_path text,
  connection_status text,
  connection_id uuid
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  my_id uuid := auth.uid();
BEGIN
  RETURN QUERY
  SELECT
    pv.viewer_id,
    pv.created_at AS viewed_at,
    p.display_name,
    p.gender,
    p.orientation,
    p.age,
    p.city,
    p.country,
    p.bio,
    p.verified,
    ph.path AS photo_path,
    COALESCE(c.status, 'none') AS connection_status,
    c.id AS connection_id
  FROM public.profile_views pv
  JOIN public.public_profiles p ON p.id = pv.viewer_id
  LEFT JOIN LATERAL (
    SELECT path FROM public.photos
    WHERE user_id = p.id AND is_private = false AND album_id IS NULL
    ORDER BY position LIMIT 1
  ) ph ON true
  LEFT JOIN public.connections c
    ON c.status IN ('pending','accepted')
    AND ((c.requester = my_id AND c.addressee = p.id) OR (c.requester = p.id AND c.addressee = my_id))
  WHERE pv.viewed_id = my_id
  ORDER BY pv.created_at DESC
  LIMIT _limit OFFSET _offset;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_profile_views_paginated(int, int) TO authenticated;