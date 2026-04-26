-- Create ffjudo_members table to store FFJudo license data
CREATE TABLE IF NOT EXISTS public.ffjudo_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- FFJudo license info
  license_id text NOT NULL UNIQUE,
  license_date date NOT NULL,
  discipline text NOT NULL DEFAULT 'JUDO JUJITSU',
  dojo text,
  
  -- Personal info
  last_name text NOT NULL,
  first_name text NOT NULL,
  email text,
  phone text,
  date_of_birth date,
  gender text,
  
  -- Address
  address_line1 text,
  address_line2 text,
  postal_code text,
  city text,
  
  -- Medical & permissions
  medical_certificate text,
  commercial_authorizations boolean DEFAULT false,
  
  -- Link to helloasso_members (optional, for reconciliation)
  helloasso_member_id uuid REFERENCES public.helloasso_members(id) ON DELETE SET NULL,
  
  -- Metadata
  synced_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS ffjudo_members_email_idx ON public.ffjudo_members(email);
CREATE INDEX IF NOT EXISTS ffjudo_members_name_idx ON public.ffjudo_members(last_name, first_name);
CREATE INDEX IF NOT EXISTS ffjudo_members_city_idx ON public.ffjudo_members(city);
CREATE INDEX IF NOT EXISTS ffjudo_members_helloasso_member_id_idx ON public.ffjudo_members(helloasso_member_id);

-- Enable RLS
ALTER TABLE public.ffjudo_members ENABLE ROW LEVEL SECURITY;

-- RLS policies: admins can read all, others can read their own
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ffjudo_members'
      AND policyname = 'admins_read_all_ffjudo_members'
  ) THEN
    CREATE POLICY "admins_read_all_ffjudo_members"
      ON public.ffjudo_members
      FOR SELECT
      TO authenticated
      USING (public.is_admin());
  END IF;
END;
$$;

-- Create a view for reconciliation: shows discrepancies between HelloAsso and FFJudo
CREATE OR REPLACE VIEW public.member_reconciliation AS
SELECT
  COALESCE(ha.id, fm.id) as id,
  ha.first_name as helloasso_first_name,
  ha.last_name as helloasso_last_name,
  fm.first_name as ffjudo_first_name,
  fm.last_name as ffjudo_last_name,
  ha.email as helloasso_email,
  fm.email as ffjudo_email,
  ha.id as helloasso_id,
  fm.id as ffjudo_id,
  fm.license_id,
  CASE
    WHEN ha.id IS NULL THEN 'FFJudo only (not in HelloAsso)'
    WHEN fm.id IS NULL THEN 'HelloAsso only (not in FFJudo)'
    WHEN LOWER(TRIM(ha.first_name)) != LOWER(TRIM(fm.first_name))
      OR LOWER(TRIM(ha.last_name)) != LOWER(TRIM(fm.last_name)) THEN 'Name mismatch'
    WHEN ha.email != fm.email AND ha.email IS NOT NULL AND fm.email IS NOT NULL THEN 'Email mismatch'
    ELSE 'OK'
  END as status
FROM public.helloasso_members ha
FULL OUTER JOIN public.ffjudo_members fm
  ON LOWER(TRIM(ha.first_name)) = LOWER(TRIM(fm.first_name))
    AND LOWER(TRIM(ha.last_name)) = LOWER(TRIM(fm.last_name))
ORDER BY status DESC, COALESCE(ha.last_name, fm.last_name), COALESCE(ha.first_name, fm.first_name);

-- Grant access to authenticated users for the view
GRANT SELECT ON public.member_reconciliation TO authenticated;
