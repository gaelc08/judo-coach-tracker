-- Migration: ajouter la colonne civilite dans la table profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS civilite TEXT
  CHECK (civilite IN ('MR', 'MME'))
  DEFAULT 'MR';

COMMENT ON COLUMN profiles.civilite IS 'Civilité : MR ou MME';
