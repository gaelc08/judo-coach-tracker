-- Baseline migration for fresh Supabase projects.
--
-- Historical context:
-- Earlier environments had public.coaches and public.time_data created manually.
-- Later migrations (20260309+) assume those relations already exist.
-- This migration reconstructs that baseline so `supabase db push` works on clean projects.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.coaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  first_name text,
  email text,
  address text,
  vehicle text,
  fiscal_power text,
  hourly_rate numeric NOT NULL DEFAULT 0,
  daily_allowance numeric NOT NULL DEFAULT 0,
  km_rate numeric NOT NULL DEFAULT 0.35,
  role text NOT NULL DEFAULT 'entraineur',
  owner_uid uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS coaches_owner_uid_unique_idx
  ON public.coaches (owner_uid)
  WHERE owner_uid IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.time_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  date date NOT NULL,
  hours numeric NOT NULL DEFAULT 0,
  competition boolean NOT NULL DEFAULT false,
  km numeric NOT NULL DEFAULT 0,
  description text,
  departure_place text,
  arrival_place text,
  peage numeric NOT NULL DEFAULT 0,
  justification_url text,
  owner_uid uuid,
  owner_email text,
  CONSTRAINT time_data_unique_day_per_coach UNIQUE (coach_id, date),
  CONSTRAINT time_data_hours_non_negative CHECK (hours >= 0),
  CONSTRAINT time_data_km_non_negative CHECK (km >= 0),
  CONSTRAINT time_data_peage_non_negative CHECK (peage >= 0)
);

ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_data ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'coaches'
      AND policyname = 'admins_insert_coaches'
  ) THEN
    CREATE POLICY "admins_insert_coaches"
      ON public.coaches
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_admin());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'coaches'
      AND policyname = 'coaches_select_own_or_admin'
  ) THEN
    CREATE POLICY "coaches_select_own_or_admin"
      ON public.coaches
      FOR SELECT
      TO authenticated
      USING (owner_uid = auth.uid() OR public.is_admin());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'coaches'
      AND policyname = 'coaches_update_own_or_admin'
  ) THEN
    CREATE POLICY "coaches_update_own_or_admin"
      ON public.coaches
      FOR UPDATE
      TO authenticated
      USING (owner_uid = auth.uid() OR public.is_admin())
      WITH CHECK (owner_uid = auth.uid() OR public.is_admin());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'coaches'
      AND policyname = 'admins_delete_coaches'
  ) THEN
    CREATE POLICY "admins_delete_coaches"
      ON public.coaches
      FOR DELETE
      TO authenticated
      USING (public.is_admin());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'time_data'
      AND policyname = 'time_data_select_own_or_admin'
  ) THEN
    CREATE POLICY "time_data_select_own_or_admin"
      ON public.time_data
      FOR SELECT
      TO authenticated
      USING (
        public.is_admin()
        OR owner_uid = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.coaches c
          WHERE c.id = coach_id
            AND c.owner_uid = auth.uid()
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'time_data'
      AND policyname = 'time_data_insert_own_or_admin'
  ) THEN
    CREATE POLICY "time_data_insert_own_or_admin"
      ON public.time_data
      FOR INSERT
      TO authenticated
      WITH CHECK (
        public.is_admin()
        OR EXISTS (
          SELECT 1
          FROM public.coaches c
          WHERE c.id = coach_id
            AND c.owner_uid = auth.uid()
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'time_data'
      AND policyname = 'time_data_update_own_or_admin'
  ) THEN
    CREATE POLICY "time_data_update_own_or_admin"
      ON public.time_data
      FOR UPDATE
      TO authenticated
      USING (
        public.is_admin()
        OR EXISTS (
          SELECT 1
          FROM public.coaches c
          WHERE c.id = coach_id
            AND c.owner_uid = auth.uid()
        )
      )
      WITH CHECK (
        public.is_admin()
        OR EXISTS (
          SELECT 1
          FROM public.coaches c
          WHERE c.id = coach_id
            AND c.owner_uid = auth.uid()
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'time_data'
      AND policyname = 'time_data_delete_own_or_admin'
  ) THEN
    CREATE POLICY "time_data_delete_own_or_admin"
      ON public.time_data
      FOR DELETE
      TO authenticated
      USING (
        public.is_admin()
        OR EXISTS (
          SELECT 1
          FROM public.coaches c
          WHERE c.id = coach_id
            AND c.owner_uid = auth.uid()
        )
      );
  END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coaches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_data TO authenticated;
