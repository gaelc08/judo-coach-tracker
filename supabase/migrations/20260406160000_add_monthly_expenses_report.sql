-- Create admin monthly expenses report
-- Includes:
-- 1. View for monthly expenses by coach
-- 2. RLS policy for admin access
-- 3. Edge function for CSV/JSON export

-- 1. Create the view
CREATE OR REPLACE VIEW public.admin_monthly_expenses AS
SELECT
  DATE_TRUNC('month', t.date)::date AS month,
  c.id AS coach_id,
  c.name || ' ' || c.first_name AS coach_name,
  c.hourly_rate,
  c.km_rate,
  SUM(t.hours) AS total_hours,
  ROUND(SUM(t.hours * c.hourly_rate), 2) AS salary_amount,
  SUM(t.km) AS total_km,
  ROUND(SUM(t.km * c.km_rate), 2) AS km_amount,
  ROUND(SUM(t.hours * c.hourly_rate + t.km * c.km_rate), 2) AS total_amount
FROM
  public.time_data t
JOIN
  public.users c ON t.coach_id = c.id
GROUP BY
  month, c.id, c.name, c.first_name, c.hourly_rate, c.km_rate
ORDER BY
  month DESC, total_amount DESC;

-- 2. RLS policy for admin access
CREATE POLICY "admins_access_monthly_expenses"
ON public.admin_monthly_expenses
FOR SELECT
TO authenticated
USING (public.is_admin());

-- 3. Create a function for CSV export
CREATE OR REPLACE FUNCTION public.export_monthly_expenses_csv()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  csv_output text;
BEGIN
  SELECT string_agg(format('%s,%s,%s,%s,%s,%s,%s,%s,%s',
    to_char(month, 'YYYY-MM'),
    coach_name,
    total_hours,
    hourly_rate,
    salary_amount,
    total_km,
    km_rate,
    km_amount,
    total_amount
  ), E'\n')
  INTO csv_output
  FROM public.admin_monthly_expenses
  ORDER BY month DESC, total_amount DESC;

  RETURN 'Mois,Entraîneur,Heures,Taux Horaire (€),Salaire (€),KM,Taux KM (€),Indemnités KM (€),Total (€)' || E'\n' || csv_output;
END;
$$;

-- 4. Create a function for JSON export
CREATE OR REPLACE FUNCTION public.export_monthly_expenses_json()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  json_output json;
BEGIN
  SELECT json_agg(row_to_json(expenses))
  INTO json_output
  FROM (
    SELECT
      to_char(month, 'YYYY-MM') AS month,
      coach_name,
      total_hours,
      hourly_rate,
      salary_amount,
      total_km,
      km_rate,
      km_amount,
      total_amount
    FROM public.admin_monthly_expenses
    ORDER BY month DESC, total_amount DESC
  ) expenses;

  RETURN json_output;
END;
$$;

-- 5. Grant access to the export functions
GRANT EXECUTE ON FUNCTION public.export_monthly_expenses_csv TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_monthly_expenses_json TO authenticated;

-- 6. Create RLS policy for export functions
CREATE POLICY "admins_export_monthly_expenses"
ON public.export_monthly_expenses_csv
FOR EXECUTE
TO authenticated
USING (public.is_admin());

CREATE POLICY "admins_export_monthly_expenses"
ON public.export_monthly_expenses_json
FOR EXECUTE
TO authenticated
USING (public.is_admin());

-- 7. Create an edge function for API access (optional, can be called via REST)
-- This will be deployed separately via supabase functions deploy