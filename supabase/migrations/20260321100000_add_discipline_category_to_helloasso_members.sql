-- Add discipline and judo_category columns to helloasso_members.
-- discipline: 'judo' | 'iaido' | 'taiso' | 'other'
-- judo_category: 'Baby Judo' | 'Mini-Poussin/Poussin' | 'Benjamin/Minime' | 'Cadet/Junior/Senior' | null

ALTER TABLE public.helloasso_members
  ADD COLUMN IF NOT EXISTS discipline text,
  ADD COLUMN IF NOT EXISTS judo_category text;
