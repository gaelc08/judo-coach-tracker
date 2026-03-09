-- Create table to track frozen (locked) timesheets for a coach+month
create table if not exists frozen_timesheets (
  id uuid default gen_random_uuid() primary key,
  coach_id uuid not null references coaches(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'), -- format: "YYYY-MM"
  frozen_at timestamptz default now() not null,
  frozen_by text,            -- email of the admin who froze the timesheet
  unique(coach_id, month)
);

alter table frozen_timesheets enable row level security;

-- All authenticated users can read frozen status (to show the banner/block saves)
create policy "Authenticated users can read frozen_timesheets"
  on frozen_timesheets for select
  to authenticated
  using (true);

-- Only admins can freeze (insert)
create policy "Admins can insert frozen_timesheets"
  on frozen_timesheets for insert
  to authenticated
  with check (public.is_admin());

-- Only admins can unfreeze (delete)
create policy "Admins can delete frozen_timesheets"
  on frozen_timesheets for delete
  to authenticated
  using (public.is_admin());
