-- Set or remove admin access for a Supabase Auth user by e-mail.
--
-- Usage in Supabase SQL Editor:
--   1. Replace the values in the DECLARE block.
--   2. Run the script.
--   3. Ask the user to sign out / sign back in so their JWT picks up the new claim.

DO $$
DECLARE
  target_email text := lower('user@example.com');
  make_admin boolean := true; -- true = grant admin, false = remove admin
  target_user_id uuid;
  updated_metadata jsonb;
BEGIN
  SELECT id
  INTO target_user_id
  FROM auth.users
  WHERE lower(email) = target_email
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found in auth.users for e-mail: %', target_email;
  END IF;

  UPDATE auth.users
  SET raw_app_meta_data = jsonb_set(
        coalesce(raw_app_meta_data, '{}'::jsonb),
        '{is_admin}',
        to_jsonb(make_admin),
        true
      ),
      updated_at = now()
  WHERE id = target_user_id
  RETURNING raw_app_meta_data INTO updated_metadata;

  RAISE NOTICE 'Admin flag updated for % (%). raw_app_meta_data=%', target_email, target_user_id, updated_metadata;
END $$;

SELECT
  id,
  email,
  raw_app_meta_data
FROM auth.users
WHERE lower(email) = lower('user@example.com');
