-- Replace the legacy time_data policies with explicit policies that use the
-- canonical public.frozen_timesheets table. Once those policies are in place,
-- the temporary compatibility view can be removed.

DO $$
DECLARE
  p text;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'time_data'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.time_data', p);
  END LOOP;
END;
$$;

ALTER TABLE public.time_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_data_select_own_or_admin"
  ON public.time_data
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR owner_uid = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = coach_id
        AND u.owner_uid = auth.uid()
    )
  );

CREATE POLICY "time_data_insert_own_open_month_or_admin"
  ON public.time_data
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = coach_id
          AND u.owner_uid = auth.uid()
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.frozen_timesheets ft
        WHERE ft.coach_id = coach_id
          AND ft.month = to_char(date, 'YYYY-MM')
      )
    )
  );

CREATE POLICY "time_data_update_own_open_month_or_admin"
  ON public.time_data
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR (
      EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = coach_id
          AND u.owner_uid = auth.uid()
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.frozen_timesheets ft
        WHERE ft.coach_id = coach_id
          AND ft.month = to_char(date, 'YYYY-MM')
      )
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = coach_id
          AND u.owner_uid = auth.uid()
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.frozen_timesheets ft
        WHERE ft.coach_id = coach_id
          AND ft.month = to_char(date, 'YYYY-MM')
      )
    )
  );

CREATE POLICY "time_data_delete_own_open_month_or_admin"
  ON public.time_data
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR (
      EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = coach_id
          AND u.owner_uid = auth.uid()
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.frozen_timesheets ft
        WHERE ft.coach_id = coach_id
          AND ft.month = to_char(date, 'YYYY-MM')
      )
    )
  );

DROP VIEW IF EXISTS public.timesheet_freezes;
