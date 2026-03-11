-- Patch any remaining references to the legacy public.timesheet_freezes relation
-- across user-defined SQL objects, then remove the temporary compatibility view.
--
-- This handles cases where old trigger functions or policies still reference
-- the dropped relation outside the explicit public.time_data policies.

DO $$
DECLARE
  fn record;
  pol record;
  vw record;
  patched_definition text;
  alter_sql text;
BEGIN
  IF to_regclass('public.frozen_timesheets') IS NULL THEN
    RAISE EXCEPTION 'public.frozen_timesheets must exist before patching legacy references';
  END IF;

  -- Recreate the legacy relation name temporarily as a compatibility view so
  -- existing objects continue to resolve while we rewrite them.
  IF to_regclass('public.timesheet_freezes') IS NULL THEN
    EXECUTE $view$
      CREATE VIEW public.timesheet_freezes
      WITH (security_invoker = true)
      AS
      SELECT id, coach_id, month, frozen_at, frozen_by
      FROM public.frozen_timesheets
    $view$;
    EXECUTE 'GRANT SELECT ON public.timesheet_freezes TO anon, authenticated, service_role';
  END IF;

  -- Patch non-system functions, skipping aggregates because pg_get_functiondef()
  -- is not valid for them.
  FOR fn IN
    SELECT p.oid,
           n.nspname AS schema_name,
           p.proname,
           pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      AND p.prokind <> 'a'
      AND pg_get_functiondef(p.oid) ILIKE '%timesheet_freezes%'
  LOOP
    patched_definition := replace(fn.definition, 'public.timesheet_freezes', 'public.frozen_timesheets');
    patched_definition := replace(patched_definition, 'timesheet_freezes', 'frozen_timesheets');

    IF patched_definition <> fn.definition THEN
      EXECUTE patched_definition;
    END IF;
  END LOOP;

  -- Patch non-system views.
  FOR vw IN
    SELECT schemaname,
           viewname,
           definition
    FROM pg_views
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      AND viewname <> 'timesheet_freezes'
      AND definition ILIKE '%timesheet_freezes%'
  LOOP
    patched_definition := replace(vw.definition, 'public.timesheet_freezes', 'public.frozen_timesheets');
    patched_definition := replace(patched_definition, 'timesheet_freezes', 'frozen_timesheets');

    IF patched_definition <> vw.definition THEN
      EXECUTE format(
        'CREATE OR REPLACE VIEW %I.%I AS %s',
        vw.schemaname,
        vw.viewname,
        patched_definition
      );
    END IF;
  END LOOP;

  -- Patch non-system RLS policies.
  FOR pol IN
    SELECT schemaname,
           tablename,
           policyname,
           qual,
           with_check
    FROM pg_policies
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      AND (
        COALESCE(qual, '') ILIKE '%timesheet_freezes%'
        OR COALESCE(with_check, '') ILIKE '%timesheet_freezes%'
      )
  LOOP
    alter_sql := format('ALTER POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);

    IF pol.qual IS NOT NULL THEN
      alter_sql := alter_sql || format(
        ' USING (%s)',
        replace(replace(pol.qual, 'public.timesheet_freezes', 'public.frozen_timesheets'), 'timesheet_freezes', 'frozen_timesheets')
      );
    END IF;

    IF pol.with_check IS NOT NULL THEN
      alter_sql := alter_sql || format(
        ' WITH CHECK (%s)',
        replace(replace(pol.with_check, 'public.timesheet_freezes', 'public.frozen_timesheets'), 'timesheet_freezes', 'frozen_timesheets')
      );
    END IF;

    EXECUTE alter_sql;
  END LOOP;

  -- Remove the compatibility view once all rewrites are applied.
  DROP VIEW IF EXISTS public.timesheet_freezes;
END;
$$;
