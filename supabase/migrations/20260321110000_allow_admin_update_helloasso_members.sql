-- Allow admins to update helloasso_members (e.g. to enrich date_of_birth from CSV import).

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'helloasso_members'
      AND policyname = 'Admins can update helloasso_members'
  ) THEN
    CREATE POLICY "Admins can update helloasso_members"
      ON public.helloasso_members
      FOR UPDATE TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END; $$;
