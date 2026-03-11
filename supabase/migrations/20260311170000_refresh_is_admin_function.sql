-- Refresh public.is_admin() on projects that still have an older implementation
-- referencing the legacy public.admins table.
--
-- The app now uses the JWT app_metadata claim `is_admin: true` as the single
-- source of truth for admin access.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean,
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;