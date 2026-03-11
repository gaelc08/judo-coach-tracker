-- Recreate the `justifications` storage bucket if it was deleted manually.
-- Keeps the bucket public so existing public receipt URLs work again.

INSERT INTO storage.buckets (id, name, public)
VALUES ('justifications', 'justifications', true)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'Coaches can upload their own justifications'
  ) THEN
    CREATE POLICY "Coaches can upload their own justifications"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'justifications'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'Coaches can update their own justifications'
  ) THEN
    CREATE POLICY "Coaches can update their own justifications"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
      bucket_id = 'justifications'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'Coaches can delete their own justifications'
  ) THEN
    CREATE POLICY "Coaches can delete their own justifications"
    ON storage.objects FOR DELETE TO authenticated
    USING (
      bucket_id = 'justifications'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;
END$$;
