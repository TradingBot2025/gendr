-- Add extended profile detail fields.
-- NOTE: This project is managed by Lovable. If the schema is managed there,
-- mirror these columns in the Lovable editor so both stay in sync.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS height integer,
  ADD COLUMN IF NOT EXISTS weight integer,
  ADD COLUMN IF NOT EXISTS education text,
  ADD COLUMN IF NOT EXISTS children text,
  ADD COLUMN IF NOT EXISTS marital_status text;

COMMENT ON COLUMN public.profiles.height IS 'Height in centimetres';
COMMENT ON COLUMN public.profiles.weight IS 'Weight in kilograms';
COMMENT ON COLUMN public.profiles.education IS 'Highest education level';
COMMENT ON COLUMN public.profiles.children IS 'Children status (e.g. none, have, want)';
COMMENT ON COLUMN public.profiles.marital_status IS 'Marital/relationship status';