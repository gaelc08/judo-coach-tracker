-- Migration: add 'admin' as a valid profile_type in profiles
-- and add function_title column to profiles.
-- Also create a function to upsert an admin's own profile entry in profiles
-- when they save their admin_profiles record.

-- ─── Step 1: drop old constraint (name may vary) and add admin ───────────────
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS coaches_profile_type_allowed;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS users_profile_type_allowed;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_profile_type_allowed;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_profile_type_allowed
  CHECK (profile_type IN ('coach', 'benevole', 'admin'));

-- ─── Step 2: add function_title to profiles ──────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS function_title text;

-- ─── Step 3: function to sync admin_profiles → profiles ──────────────────────
-- Called after upsert on admin_profiles to keep profiles in sync.
CREATE OR REPLACE FUNCTION public.sync_admin_profile_to_profiles()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_uid        uuid;
  v_ap         public.admin_profiles%ROWTYPE;
  v_profile_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT * INTO v_ap FROM public.admin_profiles WHERE owner_uid = v_uid LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  -- Check if a profile already exists for this admin
  SELECT id INTO v_profile_id FROM public.profiles
  WHERE owner_uid = v_uid AND profile_type = 'admin'
  LIMIT 1;

  IF v_profile_id IS NOT NULL THEN
    -- Update existing
    UPDATE public.profiles SET
      name           = v_ap.name,
      first_name     = v_ap.first_name,
      function_title = v_ap.function_title,
      address        = v_ap.address,
      vehicle        = v_ap.vehicle,
      fiscal_power   = v_ap.fiscal_power,
      km_rate        = v_ap.km_rate,
      updated_at     = now()
    WHERE id = v_profile_id;
  ELSE
    -- Insert new profile for admin
    INSERT INTO public.profiles (
      name, first_name, function_title, address,
      vehicle, fiscal_power, km_rate,
      profile_type, role, owner_uid,
      hourly_rate, daily_allowance
    ) VALUES (
      v_ap.name, v_ap.first_name, v_ap.function_title, v_ap.address,
      v_ap.vehicle, v_ap.fiscal_power, v_ap.km_rate,
      'admin', 'admin', v_uid,
      0, 0
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_admin_profile_to_profiles() TO authenticated;

-- ─── Step 4: RLS for admin profile_type rows in profiles ─────────────────────
-- Admins can already read/write all profiles via existing policies.
-- Non-admins cannot see profile_type='admin' rows (they already can't via RLS).








