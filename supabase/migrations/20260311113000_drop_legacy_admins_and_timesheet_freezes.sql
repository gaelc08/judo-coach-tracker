-- Migration: drop legacy admin and frozen-timesheet tables no longer used by the app
--
-- Canonical sources of truth:
--   - admin rights live in auth.users.raw_app_meta_data / JWT app_metadata.is_admin
--   - frozen timesheets live in public.frozen_timesheets
--
-- Legacy tables kept showing up in the Supabase dashboard and caused confusion:
--   - public.admins
--   - public.timesheet_freezes

DO $$
BEGIN
  IF to_regclass('public.timesheet_freezes') IS NOT NULL THEN
    IF to_regclass('public.frozen_timesheets') IS NULL THEN
      RAISE EXCEPTION 'public.frozen_timesheets must exist before migrating public.timesheet_freezes';
    END IF;

    INSERT INTO public.frozen_timesheets (coach_id, month, frozen_at, frozen_by)
    SELECT tf.coach_id, tf.month, tf.frozen_at, tf.frozen_by
    FROM public.timesheet_freezes tf
    ON CONFLICT (coach_id, month) DO NOTHING;

    DROP TABLE public.timesheet_freezes;
  END IF;

  IF to_regclass('public.admins') IS NOT NULL THEN
    DROP TABLE public.admins;
  END IF;
END;
$$;