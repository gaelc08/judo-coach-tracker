-- Migration: remove unused duplicate frozen-timesheet tables
--
-- Problem: the Supabase project may contain older experimental tables for frozen
-- timesheets alongside the canonical public.frozen_timesheets table used by the
-- application. Keeping duplicate tables around is confusing in the dashboard and
-- risks future writes going to the wrong place.
--
-- Fix: keep public.frozen_timesheets as the single source of truth, copy rows
-- from any similarly named legacy table when it has the expected columns, then
-- drop the duplicate table.

DO $$
DECLARE
  legacy_table record;
  has_expected_columns boolean;
BEGIN
  IF to_regclass('public.frozen_timesheets') IS NULL THEN
    RAISE EXCEPTION 'public.frozen_timesheets must exist before dropping legacy frozen-timesheet tables';
  END IF;

  FOR legacy_table IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> 'frozen_timesheets'
      AND tablename ILIKE 'frozen%timesheet%'
  LOOP
    SELECT COUNT(*) = 4
    INTO has_expected_columns
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = legacy_table.tablename
      AND column_name IN ('coach_id', 'month', 'frozen_at', 'frozen_by');

    IF has_expected_columns THEN
      EXECUTE format(
        'INSERT INTO public.frozen_timesheets (coach_id, month, frozen_at, frozen_by)
         SELECT coach_id, month, COALESCE(frozen_at, now()), frozen_by
         FROM public.%I
         ON CONFLICT (coach_id, month) DO NOTHING',
        legacy_table.tablename
      );
    END IF;

    EXECUTE format('DROP TABLE public.%I', legacy_table.tablename);
  END LOOP;
END;
$$;
