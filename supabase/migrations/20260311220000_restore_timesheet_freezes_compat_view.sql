-- Compatibility migration: restore the legacy public.timesheet_freezes relation
-- as a read-only view over public.frozen_timesheets.
--
-- Some existing RLS policies / trigger functions in the remote database still
-- reference public.timesheet_freezes during INSERT/UPDATE on public.time_data.
-- The legacy table was intentionally dropped after migrating its rows, but
-- those stale references now fail with:
--   relation "public.timesheet_freezes" does not exist
--
-- Reintroducing the relation as a compatibility view is the safest hotfix:
--   - no application code needs to change
--   - existing reads against the legacy name keep working
--   - the canonical source of truth remains public.frozen_timesheets

DO $$
DECLARE
	legacy_relkind "char";
BEGIN
	IF to_regclass('public.frozen_timesheets') IS NULL THEN
		RAISE EXCEPTION 'public.frozen_timesheets must exist before creating the compatibility view public.timesheet_freezes';
	END IF;

	SELECT c.relkind
	INTO legacy_relkind
	FROM pg_class c
	JOIN pg_namespace n ON n.oid = c.relnamespace
	WHERE n.nspname = 'public'
		AND c.relname = 'timesheet_freezes';

	IF legacy_relkind IS NULL THEN
		EXECUTE $view$
			CREATE VIEW public.timesheet_freezes
			WITH (security_invoker = true)
			AS
			SELECT
				id,
				coach_id,
				month,
				frozen_at,
				frozen_by
			FROM public.frozen_timesheets
		$view$;
	ELSIF legacy_relkind = 'v' THEN
		EXECUTE $view$
			CREATE OR REPLACE VIEW public.timesheet_freezes
			WITH (security_invoker = true)
			AS
			SELECT
				id,
				coach_id,
				month,
				frozen_at,
				frozen_by
			FROM public.frozen_timesheets
		$view$;
	ELSE
		RAISE NOTICE 'Skipping public.timesheet_freezes compatibility view creation because an existing non-view relation already uses that name';
	END IF;
END;
$$;

GRANT SELECT ON public.timesheet_freezes TO anon;
GRANT SELECT ON public.timesheet_freezes TO authenticated;
GRANT SELECT ON public.timesheet_freezes TO service_role;

COMMENT ON VIEW public.timesheet_freezes IS
	'Legacy compatibility view over public.frozen_timesheets. Keep frozen_timesheets as the canonical source of truth.';
