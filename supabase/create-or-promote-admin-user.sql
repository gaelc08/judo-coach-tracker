-- Create a Supabase Auth user if needed, then grant or remove admin access.
--
-- Usage in Supabase SQL Editor:
--   1. Replace the values below.
--   2. Run the script.
--   3. If the user already exists, only the admin flag is updated.
--   4. The user must sign out / sign back in to refresh the JWT claim.
--
-- Notes:
--   - This writes directly to auth.users.
--   - For a newly created user, the password is stored by Supabase as a bcrypt hash.
--   - Prefer using this only for maintenance/bootstrap tasks.

DO $$
DECLARE
  target_email text := lower('user@example.com');
  target_password text := 'ChangeMe123!';
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
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      invited_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      target_email,
      crypt(target_password, gen_salt('bf')),
      now(),
      now(),
      '',
      '',
      '',
      '',
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      '{}'::jsonb,
      now(),
      now()
    )
    RETURNING id INTO target_user_id;
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

  RAISE NOTICE 'Admin user ready: % (%). raw_app_meta_data=%', target_email, target_user_id, updated_metadata;
END $$;

SELECT
  id,
  email,
  raw_app_meta_data,
  email_confirmed_at,
  created_at
FROM auth.users
WHERE lower(email) = lower('user@example.com');
