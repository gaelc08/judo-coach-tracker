-- Add hotel expense support to time_data for the global expense report.
--
-- Keeps toll receipts on the existing columns and adds dedicated hotel fields.

ALTER TABLE public.time_data
  ADD COLUMN IF NOT EXISTS hotel numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hotel_justification_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'time_data_hotel_non_negative'
      AND conrelid = 'public.time_data'::regclass
  ) THEN
    ALTER TABLE public.time_data
      ADD CONSTRAINT time_data_hotel_non_negative CHECK (hotel >= 0);
  END IF;
END
$$;
