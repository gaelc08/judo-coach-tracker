-- Enforce unique coach/profile emails, case-insensitively.
-- Prevents creating two profiles with the same email address.

CREATE UNIQUE INDEX IF NOT EXISTS coaches_email_unique_ci_idx
ON public.coaches (lower(email))
WHERE email IS NOT NULL;
