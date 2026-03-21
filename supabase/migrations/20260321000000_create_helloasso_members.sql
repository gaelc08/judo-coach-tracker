-- Create helloasso_members table to store synced member data from HelloAsso.

CREATE TABLE IF NOT EXISTS public.helloasso_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  helloasso_id text UNIQUE,
  first_name text,
  last_name text,
  email text,
  date_of_birth text,
  membership_amount numeric,
  membership_date timestamptz,
  membership_state text,
  raw_data jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.helloasso_members ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'helloasso_members'
      AND policyname = 'Admins can read helloasso_members'
  ) THEN
    CREATE POLICY "Admins can read helloasso_members"
      ON public.helloasso_members
      FOR SELECT TO authenticated
      USING (public.is_admin());
  END IF;
END; $$;
