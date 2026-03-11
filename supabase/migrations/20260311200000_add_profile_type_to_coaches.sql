-- Add profile type support to coaches so volunteers can use expense features
-- without salary-related fields.

ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS profile_type text NOT NULL DEFAULT 'coach';

UPDATE public.coaches
SET profile_type = 'coach'
WHERE profile_type IS NULL
   OR btrim(profile_type) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'coaches_profile_type_allowed'
      AND conrelid = 'public.coaches'::regclass
  ) THEN
    ALTER TABLE public.coaches
      ADD CONSTRAINT coaches_profile_type_allowed
      CHECK (profile_type IN ('coach', 'benevole'));
  END IF;
END
$$;
