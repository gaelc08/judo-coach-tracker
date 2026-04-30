-- Profil personnel des administrateurs

CREATE TABLE IF NOT EXISTS public.admin_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  owner_uid uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  first_name text,
  function_title text,
  address text,
  vehicle text,
  fiscal_power text,
  km_rate numeric NOT NULL DEFAULT 0.35,
  CONSTRAINT admin_profiles_owner_uid_unique UNIQUE (owner_uid)
);

ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admin_profiles' AND policyname='admin_profiles_select_own') THEN
    CREATE POLICY "admin_profiles_select_own" ON public.admin_profiles FOR SELECT TO authenticated USING (owner_uid = auth.uid() OR public.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admin_profiles' AND policyname='admin_profiles_insert_own') THEN
    CREATE POLICY "admin_profiles_insert_own" ON public.admin_profiles FOR INSERT TO authenticated WITH CHECK (owner_uid = auth.uid() AND public.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admin_profiles' AND policyname='admin_profiles_update_own') THEN
    CREATE POLICY "admin_profiles_update_own" ON public.admin_profiles FOR UPDATE TO authenticated USING (owner_uid = auth.uid()) WITH CHECK (owner_uid = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admin_profiles' AND policyname='admin_profiles_delete_own') THEN
    CREATE POLICY "admin_profiles_delete_own" ON public.admin_profiles FOR DELETE TO authenticated USING (owner_uid = auth.uid());
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_profiles TO authenticated;
