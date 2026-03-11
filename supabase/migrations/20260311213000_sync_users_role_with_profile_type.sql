-- Keep `role` aligned with `profile_type` in public.users.
--
-- Expected values:
-- - profile_type: coach | benevole
-- - role: entraineur | benevole

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role text;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS coaches_role_check;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_allowed;

UPDATE public.users
SET profile_type = CASE
      WHEN lower(coalesce(role, '')) = 'benevole' THEN 'benevole'
      ELSE 'coach'
    END
WHERE profile_type IS NULL
   OR btrim(profile_type) = ''
   OR profile_type NOT IN ('coach', 'benevole');

UPDATE public.users
SET role = CASE
      WHEN profile_type = 'benevole' THEN 'benevole'
      ELSE 'entraineur'
    END
WHERE role IS NULL
   OR btrim(role) = ''
   OR role NOT IN ('entraineur', 'benevole')
   OR (profile_type = 'benevole' AND role <> 'benevole')
   OR (profile_type = 'coach' AND role <> 'entraineur');

ALTER TABLE public.users
  ALTER COLUMN role SET DEFAULT 'entraineur';

DO $$
BEGIN
  ALTER TABLE public.users
    ADD CONSTRAINT users_role_allowed
    CHECK (role IN ('entraineur', 'benevole'));
END
$$;
