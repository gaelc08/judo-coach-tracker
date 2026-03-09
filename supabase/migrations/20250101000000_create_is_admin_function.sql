-- Create the is_admin() helper function used by RLS policies and the client
-- app (via /rest/v1/rpc/is_admin).
--
-- An admin is identified by the boolean flag `is_admin: true` stored inside
-- the `app_metadata` claim of their Supabase Auth JWT.  Set this flag with the
-- Supabase Admin API or the dashboard:
--   Dashboard → Authentication → Users → <user> → app_metadata → { "is_admin": true }
--
-- SECURITY DEFINER + fixed search_path prevent privilege-escalation attacks.

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

-- Allow any authenticated user to call this function (needed for RLS checks
-- and for the client-side RPC call at /rest/v1/rpc/is_admin).
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
