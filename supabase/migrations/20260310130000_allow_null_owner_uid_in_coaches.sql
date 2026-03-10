-- Migration: allow NULL owner_uid in the coaches table
--
-- Problem: the coaches.owner_uid column was defined with a NOT NULL constraint.
-- This prevented admins from creating coach profiles with owner_uid = NULL,
-- which is the intended state before a coach accepts their invitation and
-- claims their profile via claim_coach_profile().
-- The previous migration (20260310120000) fixed the RLS policies but did not
-- remove the NOT NULL constraint, so the database itself still rejected the
-- INSERT and raised:
--   null value in column "owner_uid" of relation "coaches" violates not-null constraint
--
-- Fix: drop the NOT NULL constraint so owner_uid can be NULL until the coach
-- logs in for the first time and calls claim_coach_profile().

ALTER TABLE public.coaches
  ALTER COLUMN owner_uid DROP NOT NULL;
