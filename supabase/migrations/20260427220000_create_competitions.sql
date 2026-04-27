-- Migration: create_competitions
-- Creates the competitions table for the Calendrier des compétitions feature.

CREATE TABLE IF NOT EXISTS public.competitions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id text UNIQUE NOT NULL,  -- extrait de l'URL judo-moselle.fr (ex: "64")
  title text NOT NULL,
  date date NOT NULL,
  lieu_nom text,
  lieu_adresse text,
  lieu_ville text,
  niveau text,  -- LOCAL, DEPARTEMENTAL, REGIONAL, NATIONAL, FEDERAL
  categories text[],  -- {POUSSIN, BENJAMIN, MINIME, CADET, JUNIOR, SENIOR}
  type_competition text,  -- INDIVIDUELLE, EQUIPE, STAGE, PASSAGE DE GRADE
  commentaire text,
  url_source text,
  club_selected boolean DEFAULT false,  -- marqué "retenu" par l'admin
  imported_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;

-- Lecture pour tous les utilisateurs authentifiés
CREATE POLICY "competitions_select" ON public.competitions
  FOR SELECT TO authenticated USING (true);

-- Écriture réservée aux admins (via is_admin())
CREATE POLICY "competitions_insert_admin" ON public.competitions
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "competitions_update_admin" ON public.competitions
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "competitions_delete_admin" ON public.competitions
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- Index
CREATE INDEX IF NOT EXISTS competitions_date_idx ON public.competitions(date);
CREATE INDEX IF NOT EXISTS competitions_niveau_idx ON public.competitions(niveau);
