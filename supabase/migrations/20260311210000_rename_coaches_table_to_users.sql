-- Rename the public.coaches table to public.users to better match the fact
-- that the table now stores both coach and volunteer profiles.
--
-- Notes:
-- - Existing foreign keys that reference public.coaches are updated automatically
--   by PostgreSQL when the table is renamed.
-- - Keep a compatibility wrapper for claim_coach_profile() so older deployed
--   clients still work during the rollout.

ALTER TABLE IF EXISTS public.coaches RENAME TO users;

ALTER INDEX IF EXISTS public.coaches_email_unique_ci_idx RENAME TO users_email_unique_ci_idx;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'coaches_profile_type_allowed'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      RENAME CONSTRAINT coaches_profile_type_allowed TO users_profile_type_allowed;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.claim_user_profile()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_email   text;
BEGIN
  v_email := auth.jwt() ->> 'email';

  IF v_email IS NULL THEN
    RETURN NULL;
  END IF;

  WITH candidate AS (
    SELECT id
    FROM public.users
    WHERE owner_uid IS NULL
      AND lower(btrim(email)) = lower(btrim(v_email))
    ORDER BY id
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.users AS u
  SET owner_uid = auth.uid()
  FROM candidate
  WHERE u.id = candidate.id
  RETURNING u.id INTO v_user_id;

  RETURN v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_user_profile() TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_coach_profile()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.claim_user_profile();
$$;

GRANT EXECUTE ON FUNCTION public.claim_coach_profile() TO authenticated;
