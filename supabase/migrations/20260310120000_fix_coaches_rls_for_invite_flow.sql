-- Migration: fix coaches table RLS policies for the invitation flow
--
-- Problem: The existing INSERT policy required owner_uid = auth.uid(), which
-- prevented admins from creating coach profiles with owner_uid = NULL (the
-- intended state before a coach accepts their invitation and claims their
-- profile via claim_coach_profile()).
--
-- Fix: Drop all existing coaches policies and replace them with policies that
-- allow admins full access and restrict coaches to their own rows.
-- Depends on public.is_admin() (20250101000000_create_is_admin_function.sql).

-- Step 1: Drop all existing policies on the coaches table so we start clean.
DO $$
DECLARE
  p text;
BEGIN
  FOR p IN
    SELECT policyname
    FROM   pg_policies
    WHERE  schemaname = 'public'
      AND  tablename  = 'coaches'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.coaches', p);
  END LOOP;
END;
$$;

-- Step 2: Ensure RLS is enabled.
ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;

-- INSERT: Only admins can create coach profiles.
--   owner_uid may be NULL (profile will be claimed on first login).
CREATE POLICY "admins_insert_coaches"
  ON public.coaches
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- SELECT: Coaches can read their own profile; admins can read all.
CREATE POLICY "coaches_select_own_or_admin"
  ON public.coaches
  FOR SELECT
  TO authenticated
  USING (owner_uid = auth.uid() OR public.is_admin());

-- UPDATE: Coaches can update their own profile; admins can update any.
CREATE POLICY "coaches_update_own_or_admin"
  ON public.coaches
  FOR UPDATE
  TO authenticated
  USING (owner_uid = auth.uid() OR public.is_admin())
  WITH CHECK (owner_uid = auth.uid() OR public.is_admin());

-- DELETE: Only admins can delete coach profiles.
CREATE POLICY "admins_delete_coaches"
  ON public.coaches
  FOR DELETE
  TO authenticated
  USING (public.is_admin());
