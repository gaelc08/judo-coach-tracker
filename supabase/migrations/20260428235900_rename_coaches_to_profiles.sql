-- Migration: rename coaches/users → profiles
-- This migration was applied manually to production before being tracked.
-- All table renames, policy recreations, and function updates are already in place.
-- This is a no-op to mark the migration as applied.

DO $$ BEGIN
  -- Ensure profiles table exists (should already be the case)
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='profiles') THEN
    RAISE EXCEPTION 'Expected table public.profiles does not exist — manual intervention required.';
  END IF;
END $$;
