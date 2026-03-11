-- Add purchase expense support to time_data for the global expense report.
--
-- Purchases made for the club are reimbursed at actual cost and require a receipt.

ALTER TABLE public.time_data
  ADD COLUMN IF NOT EXISTS achat numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS achat_justification_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'time_data_achat_non_negative'
      AND conrelid = 'public.time_data'::regclass
  ) THEN
    ALTER TABLE public.time_data
      ADD CONSTRAINT time_data_achat_non_negative CHECK (achat >= 0);
  END IF;
END
$$;
