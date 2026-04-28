-- Migration: rename public.coaches → public.profiles
-- The active profiles table was previously named public.coaches then renamed to public.users.
-- This migration:
--   1. Drops legacy RLS policies on time_data that still reference public.coaches
--   2. Drops the now-empty legacy public.coaches table
--   3. Renames public.users → public.profiles
--   4. Recreates all RLS policies on time_data that referenced users → profiles
--   5. Updates the claim_user_profile() function to reference public.profiles

-- ─── Step 1: Drop legacy RLS policies on time_data that reference coaches ───
DROP POLICY IF EXISTS "time_data_insert_own_or_admin"           ON public.time_data;
DROP POLICY IF EXISTS "time_data_update_own_or_admin"           ON public.time_data;
DROP POLICY IF EXISTS "time_data_delete_own_or_admin"           ON public.time_data;

-- ─── Step 2: Drop legacy empty coaches table ────────────────────────────────
DROP TABLE IF EXISTS public.coaches;

-- ─── Step 3: Rename users → profiles ────────────────────────────────────────
ALTER TABLE public.users RENAME TO profiles;

-- FKs from time_data and frozen_timesheets follow automatically.
-- Remaining RLS policies on users/profiles follow automatically.

-- ─── Step 4: Recreate the dropped policies pointing to profiles ──────────────
CREATE POLICY "time_data_insert_own_or_admin"
  ON public.time_data FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
    OR (EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = time_data.coach_id AND p.owner_uid = auth.uid()
    ))
  );

CREATE POLICY "time_data_update_own_or_admin"
  ON public.time_data FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR (EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = time_data.coach_id AND p.owner_uid = auth.uid()
    ))
  );

CREATE POLICY "time_data_delete_own_or_admin"
  ON public.time_data FOR DELETE TO authenticated
  USING (
    is_admin()
    OR (EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = time_data.coach_id AND p.owner_uid = auth.uid()
    ))
  );

-- ─── Step 5: Update RLS policies on time_data that reference users → profiles ─
-- The policies referencing `users u` (select, insert_open, update_open, delete_open)
-- need to be recreated to reference profiles.

DROP POLICY IF EXISTS "time_data_select_own_or_admin"               ON public.time_data;
DROP POLICY IF EXISTS "time_data_insert_own_open_month_or_admin"    ON public.time_data;
DROP POLICY IF EXISTS "time_data_update_own_open_month_or_admin"    ON public.time_data;
DROP POLICY IF EXISTS "time_data_delete_own_open_month_or_admin"    ON public.time_data;

CREATE POLICY "time_data_select_own_or_admin"
  ON public.time_data FOR SELECT TO authenticated
  USING (
    is_admin()
    OR owner_uid = auth.uid()
    OR (EXISTS (
      SELECT 1 FROM public.profiles u
      WHERE u.id = time_data.coach_id AND u.owner_uid = auth.uid()
    ))
  );

CREATE POLICY "time_data_insert_own_open_month_or_admin"
  ON public.time_data FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
    OR (
      (EXISTS (
        SELECT 1 FROM public.profiles u
        WHERE u.id = time_data.coach_id AND u.owner_uid = auth.uid()
      ))
      AND (NOT (EXISTS (
        SELECT 1 FROM frozen_timesheets ft
        WHERE ft.coach_id = ft.coach_id
          AND ft.month = to_char(time_data.date::timestamptz, 'YYYY-MM')
      )))
    )
  );

CREATE POLICY "time_data_update_own_open_month_or_admin"
  ON public.time_data FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR (
      (EXISTS (
        SELECT 1 FROM public.profiles u
        WHERE u.id = time_data.coach_id AND u.owner_uid = auth.uid()
      ))
      AND (NOT (EXISTS (
        SELECT 1 FROM frozen_timesheets ft
        WHERE ft.coach_id = ft.coach_id
          AND ft.month = to_char(time_data.date::timestamptz, 'YYYY-MM')
      )))
    )
  );

CREATE POLICY "time_data_delete_own_open_month_or_admin"
  ON public.time_data FOR DELETE TO authenticated
  USING (
    is_admin()
    OR (
      (EXISTS (
        SELECT 1 FROM public.profiles u
        WHERE u.id = time_data.coach_id AND u.owner_uid = auth.uid()
      ))
      AND (NOT (EXISTS (
        SELECT 1 FROM frozen_timesheets ft
        WHERE ft.coach_id = ft.coach_id
          AND ft.month = to_char(time_data.date::timestamptz, 'YYYY-MM')
      )))
    )
  );

-- ─── Step 6: Recreate claim_user_profile() referencing public.profiles ───────
CREATE OR REPLACE FUNCTION public.claim_user_profile()
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
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
    FROM public.profiles
    WHERE owner_uid IS NULL
      AND lower(btrim(email)) = lower(btrim(v_email))
    ORDER BY id
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.profiles AS u
  SET owner_uid = auth.uid()
  FROM candidate
  WHERE u.id = candidate.id
  RETURNING u.id INTO v_user_id;

  RETURN v_user_id;
END;
$$;
