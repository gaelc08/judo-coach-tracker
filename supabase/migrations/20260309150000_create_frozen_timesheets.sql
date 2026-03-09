-- Create table to track frozen (locked) timesheets for a coach+month
create table if not exists frozen_timesheets (
  id uuid default gen_random_uuid() primary key,
  coach_id uuid not null references coaches(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'), -- format: "YYYY-MM"
  frozen_at timestamptz default now() not null,
  frozen_by text,            -- email of the admin who froze the timesheet
  unique(coach_id, month)
);

alter table frozen_timesheets enable row level security;

-- All authenticated users can read frozen status (to show the banner/block saves)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'frozen_timesheets'
      AND policyname = 'Authenticated users can read frozen_timesheets'
  ) THEN
    CREATE POLICY "Authenticated users can read frozen_timesheets"
      ON frozen_timesheets FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END$$;

-- Only admins can freeze (insert)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'frozen_timesheets'
      AND policyname = 'Admins can insert frozen_timesheets'
  ) THEN
    CREATE POLICY "Admins can insert frozen_timesheets"
      ON frozen_timesheets FOR INSERT
      TO authenticated
      WITH CHECK (public.is_admin());
  END IF;
END$$;

-- Only admins can unfreeze (delete)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'frozen_timesheets'
      AND policyname = 'Admins can delete frozen_timesheets'
  ) THEN
    CREATE POLICY "Admins can delete frozen_timesheets"
      ON frozen_timesheets FOR DELETE
      TO authenticated
      USING (public.is_admin());
  END IF;
END$$;
