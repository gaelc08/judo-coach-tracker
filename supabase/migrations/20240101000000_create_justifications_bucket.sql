-- Create the storage bucket for toll receipt justifications.
-- The bucket is marked public so that Supabase's getPublicUrl() produces
-- accessible URLs that coaches can open directly in their browser.
-- Write and delete operations are still protected by the RLS policies below.
--
-- Note: with public=true, anyone who obtains a file URL can read it.
-- If stricter access control is required in the future, set public=false and
-- switch the application code to use createSignedUrl() instead of getPublicUrl().

INSERT INTO storage.buckets (id, name, public)
VALUES ('justifications', 'justifications', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow authenticated users to upload files into their own sub-folder.
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

-- Allow authenticated users to overwrite / replace their own files.
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

-- Allow authenticated users to delete their own files.
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
