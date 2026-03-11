-- Migration: make coach-profile claiming resilient to email casing differences
--
-- Problem: invited coach profiles are matched to the authenticated user by
-- e-mail address inside claim_coach_profile(). The original implementation used
-- a case-sensitive equality comparison, so a profile saved as
-- "Coach.Name@Example.com" would not be claimed by a user authenticated as
-- "coach.name@example.com". When that happened, the coach loaded with no linked
-- profile and could not register hours in the UI.
--
-- Fix: compare trimmed e-mail addresses case-insensitively and claim only one
-- matching unclaimed profile.

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
  v_email := auth.jwt() ->> 'email';

  IF v_email IS NULL THEN
    RETURN NULL;
  END IF;

  WITH candidate AS (
    SELECT id
    FROM public.coaches
    WHERE owner_uid IS NULL
      AND lower(btrim(email)) = lower(btrim(v_email))
    ORDER BY id
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.coaches AS c
  SET owner_uid = auth.uid()
  FROM candidate
  WHERE c.id = candidate.id
  RETURNING c.id INTO v_coach_id;

  RETURN v_coach_id;
END;
$$;
