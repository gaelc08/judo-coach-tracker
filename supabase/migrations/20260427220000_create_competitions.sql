-- Migration: create_competitions
-- Creates the competitions table for the Calendrier des compétitions feature.

CREATE TABLE IF NOT EXISTS public.competitions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id text UNIQUE NOT NULL,
  title text NOT NULL,
  date date NOT NULL,
  lieu_nom text,
  lieu_adresse text,
  lieu_ville text,
  niveau text,
  categories text[],
  type_competition text,
  commentaire text,
  url_source text,
  club_selected boolean DEFAULT false,
  imported_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='competitions' AND policyname='competitions_select') THEN
    CREATE POLICY "competitions_select" ON public.competitions FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='competitions' AND policyname='competitions_insert_admin') THEN
    CREATE POLICY "competitions_insert_admin" ON public.competitions FOR INSERT TO authenticated WITH CHECK (public.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='competitions' AND policyname='competitions_update_admin') THEN
    CREATE POLICY "competitions_update_admin" ON public.competitions FOR UPDATE TO authenticated USING (public.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='competitions' AND policyname='competitions_delete_admin') THEN
    CREATE POLICY "competitions_delete_admin" ON public.competitions FOR DELETE TO authenticated USING (public.is_admin());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS competitions_date_idx ON public.competitions(date);
CREATE INDEX IF NOT EXISTS competitions_niveau_idx ON public.competitions(niveau);
