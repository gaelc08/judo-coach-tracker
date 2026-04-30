-- Create admin monthly expenses report (view + export functions)
-- Note: RLS cannot be applied to views; access is controlled via SECURITY DEFINER functions.

-- 1. Create the view
CREATE OR REPLACE VIEW public.admin_monthly_expenses AS
SELECT
  DATE_TRUNC('month', t.date)::date AS month,
  c.id AS coach_id,
  c.name || ' ' || COALESCE(c.first_name, '') AS coach_name,
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
  public.profiles c ON t.coach_id = c.id
GROUP BY
  month, c.id, c.name, c.first_name, c.hourly_rate, c.km_rate
ORDER BY
  month DESC, total_amount DESC;

-- 2. Create a function for CSV export (SECURITY DEFINER = admin-only via is_admin() check)
CREATE OR REPLACE FUNCTION public.export_monthly_expenses_csv()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN (
    SELECT 'Mois,Entraîneur,Heures,Taux Horaire (€),Salaire (€),KM,Taux KM (€),Indemnités KM (€),Total (€)' || E'\n' ||
      string_agg(format('%s,%s,%s,%s,%s,%s,%s,%s,%s',
        to_char(month, 'YYYY-MM'),
        coach_name,
        total_hours,
        hourly_rate,
        salary_amount,
        total_km,
        km_rate,
        km_amount,
        total_amount
      ), E'\n' ORDER BY month DESC, total_amount DESC)
    FROM public.admin_monthly_expenses
  );
END;
$$;

-- 3. Create a function for JSON export
CREATE OR REPLACE FUNCTION public.export_monthly_expenses_json()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN (
    SELECT json_agg(row_to_json(expenses))
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
    ) expenses
  );
END;
$$;

-- 4. Grant access to the export functions
GRANT EXECUTE ON FUNCTION public.export_monthly_expenses_csv TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_monthly_expenses_json TO authenticated;
