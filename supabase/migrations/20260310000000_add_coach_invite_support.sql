-- Migration: add coach invitation support
--
-- Enables the "invite coach" workflow:
--   1. Admin creates a coach profile (name, email, rates) without a UUID.
--   2. Admin sends an invitation email via the `invite-coach` Edge Function.
--   3. Coach clicks the link, sets their password, and logs in.
--   4. On first login the client calls `claim_coach_profile()` which atomically
--      matches the coach profile by email and sets owner_uid = auth.uid().
--   5. Subsequent logins find the profile normally by owner_uid.
--
-- The function is SECURITY DEFINER so it can bypass RLS to find a profile that
-- has no owner_uid yet (the coach cannot SELECT it under normal RLS rules until
-- the claim has been performed).

CREATE OR REPLACE FUNCTION public.claim_coach_profile()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach_id uuid;
  v_email    text;
BEGIN
  -- Retrieve the caller's email from their JWT claims.
  v_email := auth.jwt() ->> 'email';

  IF v_email IS NULL THEN
    RETURN NULL;
  END IF;

  -- Atomically claim an unclaimed profile whose email matches.
  -- Only profiles with owner_uid IS NULL are eligible so that a coach can
  -- never hijack another coach's already-linked profile.
  UPDATE public.coaches
  SET    owner_uid = auth.uid()
  WHERE  email     = v_email
    AND  owner_uid IS NULL
  RETURNING id INTO v_coach_id;

  RETURN v_coach_id;
END;
$$;

-- Allow any authenticated user to call this function.
-- The SECURITY DEFINER body restricts the effect to the caller's own email.
GRANT EXECUTE ON FUNCTION public.claim_coach_profile() TO authenticated;
