-- ============================================================
-- IDEMPOTENT MIGRATION: Safe to run multiple times
-- Copy-paste into Supabase SQL Editor and click Run
-- ============================================================

-- 1. Create enum type (skip if exists)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  display_name text,
  gender text,
  orientation text,
  birthdate date,
  city text,
  country text,
  bio text,
  verified boolean NOT NULL DEFAULT false,
  banned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  latitude double precision,
  longitude double precision
);

-- 3. user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- 4. has_role function (updated for security)
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

-- 5. RLS policies for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles readable" ON public.profiles;
CREATE POLICY "profiles readable" ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR banned = false OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "update own profile" ON public.profiles;
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- 6. RLS policies for user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own roles" ON public.user_roles;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- 7. handle_new_user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email,'@',1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. admin_set_flags
CREATE OR REPLACE FUNCTION public.admin_set_flags(_target uuid, _verified boolean, _banned boolean)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'not allowed'; END IF;
  UPDATE public.profiles SET verified = (verified AND _verified), banned = _banned WHERE id = _target;
END; $$;

-- 9. photos table
CREATE TABLE IF NOT EXISTS public.photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  path text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  album_id uuid REFERENCES public.photo_albums(id) ON DELETE SET NULL,
  is_private boolean NOT NULL DEFAULT false,
  view_timer text NOT NULL DEFAULT 'normal' CHECK (view_timer IN ('normal','10s','15s'))
);

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

-- 10. limit_photos trigger
CREATE OR REPLACE FUNCTION public.limit_photos() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (SELECT COUNT(*) FROM public.photos WHERE user_id = NEW.user_id) >= 6 THEN
    RAISE EXCEPTION 'Maximum 6 photos allowed';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS photos_limit ON public.photos;
CREATE TRIGGER photos_limit BEFORE INSERT ON public.photos FOR EACH ROW EXECUTE FUNCTION public.limit_photos();

-- 11. connections table
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
CREATE POLICY "send request" ON public.connections FOR INSERT TO authenticated WITH CHECK (requester = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "respond request" ON public.connections;
CREATE POLICY "respond request" ON public.connections FOR UPDATE TO authenticated
USING (addressee = auth.uid())
WITH CHECK (
  addressee = auth.uid()
  AND requester = (SELECT requester FROM public.connections WHERE id = connections.id)
  AND status IN ('pending','accepted','declined')
);

DROP POLICY IF EXISTS "remove connection" ON public.connections;
CREATE POLICY "remove connection" ON public.connections FOR DELETE TO authenticated USING (auth.uid() IN (requester, addressee));

-- 12. is_connected function
CREATE OR REPLACE FUNCTION public.is_connected(_conn uuid) RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.connections WHERE id = _conn AND status = 'accepted' AND auth.uid() IN (requester, addressee))
$$;

-- 13. messages table (with expiring photo columns)
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
  sender uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text,
  attachment_path text,
  attachment_type text,
  attachment_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  view_count int NOT NULL DEFAULT 0,
  max_views int,
  attachment_viewed_at timestamptz
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read messages" ON public.messages;
CREATE POLICY "read messages" ON public.messages FOR SELECT TO authenticated
USING (
  public.is_connected(connection_id)
  AND auth.uid() IN (
    SELECT requester FROM public.connections WHERE id = connection_id
    UNION
    SELECT addressee FROM public.connections WHERE id = connection_id
  )
);

DROP POLICY IF EXISTS "send messages" ON public.messages;
CREATE POLICY "send messages" ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  sender = auth.uid()
  AND public.is_connected(connection_id)
);

DROP POLICY IF EXISTS "increment view count" ON public.messages;
CREATE POLICY "increment view count" ON public.messages FOR UPDATE TO authenticated
USING (
  public.is_connected(connection_id)
  AND auth.uid() IN (
    SELECT requester FROM public.connections WHERE id = connection_id
    UNION
    SELECT addressee FROM public.connections WHERE id = connection_id
  )
)
WITH CHECK (
  public.is_connected(connection_id)
  AND auth.uid() IN (
    SELECT requester FROM public.connections WHERE id = connection_id
    UNION
    SELECT addressee FROM public.connections WHERE id = connection_id
  )
  AND (view_count IS NOT NULL)
);

-- 14. increment_message_view function
CREATE OR REPLACE FUNCTION public.increment_message_view(message_id uuid)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max_views int;
  v_view_count int;
BEGIN
  SELECT max_views, view_count INTO v_max_views, v_view_count
  FROM public.messages WHERE id = message_id;
  
  IF v_max_views IS NULL THEN RETURN TRUE; END IF;
  IF v_view_count >= v_max_views THEN RETURN FALSE; END IF;
  
  UPDATE public.messages
  SET view_count = view_count + 1, attachment_viewed_at = now()
  WHERE id = message_id;
  
  RETURN TRUE;
END; $$;

-- 15. Backfill expires_at for existing messages
UPDATE public.messages SET expires_at = created_at + INTERVAL '24 hours' WHERE expires_at IS NULL;

-- 16. profile_views table
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

-- 17. photo_albums table
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

-- 18. reports table (with enhanced fields)
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  reason_category text CHECK (reason_category IN ('spam','fraud','money_request','fake_profile','harassment','inappropriate_content','underage','other')),
  proof_text text,
  proof_file_path text,
  auto_blocked boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','banned','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  CHECK (reporter_id <> reported_id)
);
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

-- 19. auto_block_reported_user function
CREATE OR REPLACE FUNCTION public.auto_block_reported_user(_reporter_id uuid, _reported_id uuid)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.connections
  SET status = 'declined'
  WHERE (
    (requester = _reporter_id AND addressee = _reported_id)
    OR (requester = _reported_id AND addressee = _reporter_id)
  ) AND status = 'pending';

  UPDATE public.connections
  SET status = 'declined'
  WHERE (
    (requester = _reporter_id AND addressee = _reported_id)
    OR (requester = _reported_id AND addressee = _reporter_id)
  ) AND status = 'accepted';
END; $$;

-- 20. handle_report_auto_block trigger
CREATE OR REPLACE FUNCTION public.handle_report_auto_block()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.auto_blocked THEN
    PERFORM public.auto_block_reported_user(NEW.reporter_id, NEW.reported_id);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trigger_report_auto_block ON public.reports;
CREATE TRIGGER trigger_report_auto_block
  AFTER INSERT ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_report_auto_block();

-- 21. admin_actions table
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

-- 22. referrals table
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

-- 23. ads_placements table
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

-- 24. Storage policies
DROP POLICY IF EXISTS "photos read" ON storage.objects;
CREATE POLICY "photos read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'photos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role((SELECT auth.uid()), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.photos ph
      JOIN public.connections c ON c.status = 'accepted'
        AND ((c.requester = ph.user_id AND c.addressee = auth.uid())
             OR (c.addressee = ph.user_id AND c.requester = auth.uid()))
      WHERE ph.path = storage.objects.name
    )
  )
);

DROP POLICY IF EXISTS "photos write own" ON storage.objects;
CREATE POLICY "photos write own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "photos delete own" ON storage.objects;
CREATE POLICY "photos delete own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "attachments read" ON storage.objects;
CREATE POLICY "attachments read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'attachments'
  AND public.is_connected(((storage.foldername(name))[1])::uuid)
  AND EXISTS (
    SELECT 1 FROM public.connections c
    WHERE c.id = ((storage.foldername(name))[1])::uuid
      AND c.status = 'accepted'
      AND auth.uid() IN (c.requester, c.addressee)
  )
);

DROP POLICY IF EXISTS "attachments write" ON storage.objects;
CREATE POLICY "attachments write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'attachments' AND public.is_connected(((storage.foldername(name))[1])::uuid));

-- 25. Realtime publications
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.connections;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profile_views;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reports;

-- 26. Indexes
CREATE INDEX IF NOT EXISTS messages_expires_at_idx ON public.messages(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS photos_album_idx ON public.photos(album_id);