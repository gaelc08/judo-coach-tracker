-- Create an audit log table for user and admin actions.
--
-- The application records significant actions such as profile changes,
-- timesheet updates, freezes, imports, exports, and invitation flows.

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_uid uuid NOT NULL DEFAULT auth.uid(),
  actor_email text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  target_user_id uuid,
  target_email text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
  ON public.audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_actor_uid_idx
  ON public.audit_logs (actor_uid);

CREATE INDEX IF NOT EXISTS audit_logs_action_idx
  ON public.audit_logs (action);

CREATE INDEX IF NOT EXISTS audit_logs_entity_type_idx
  ON public.audit_logs (entity_type);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_logs'
      AND policyname = 'Admins can read all audit_logs'
  ) THEN
    CREATE POLICY "Admins can read all audit_logs"
      ON public.audit_logs
      FOR SELECT
      TO authenticated
      USING (public.is_admin());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_logs'
      AND policyname = 'Users can read their own audit_logs'
  ) THEN
    CREATE POLICY "Users can read their own audit_logs"
      ON public.audit_logs
      FOR SELECT
      TO authenticated
      USING (actor_uid = auth.uid());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_logs'
      AND policyname = 'Authenticated users can insert audit_logs'
  ) THEN
    CREATE POLICY "Authenticated users can insert audit_logs"
      ON public.audit_logs
      FOR INSERT
      TO authenticated
      WITH CHECK (actor_uid = auth.uid());
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id text DEFAULT NULL,
  p_target_user_id uuid DEFAULT NULL,
  p_target_email text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.audit_logs (
    actor_uid,
    actor_email,
    action,
    entity_type,
    entity_id,
    target_user_id,
    target_email,
    metadata
  )
  VALUES (
    auth.uid(),
    NULLIF(btrim(auth.jwt() ->> 'email'), ''),
    NULLIF(btrim(p_action), ''),
    NULLIF(btrim(p_entity_type), ''),
    NULLIF(btrim(p_entity_id), ''),
    p_target_user_id,
    NULLIF(lower(btrim(COALESCE(p_target_email, ''))), ''),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, text, uuid, text, jsonb) TO authenticated;
