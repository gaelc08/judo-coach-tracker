


# Judo Coach Tracker

Web application for the Judo Club de Cattenom-Rodemack to manage coach activities, expenses, and club administration.

---

## Features

### For Coaches
- Log training, competitions, and travel in a calendar
- Track mileage, tolls, and upload receipts
- View summaries for hours, competitions, kilometers, and payments
- Export timesheets, mileage reports, or backups

### For Administrators
- Manage coach profiles
- Set rates for hours, competitions, mileage
- View/export any coach’s data
- Receive notifications and review audit logs

---

## How to Use

1. Log in with your email and password (admins invite new users)
2. Click a calendar day to add hours, competitions, or travel
3. Upload receipts for expenses
4. Review automatic totals
5. Export reports as needed

---

## Calendar Color Codes

| Color    | Meaning                  |
|----------|--------------------------|
| Green    | Training entered         |
| Blue     | Competition day          |
| Gray     | Weekend                  |
| Orange   | School holiday           |
| Red/Pink | Public holiday (France)  |

---

## Technical Overview

- Static SPA (HTML, CSS, ES6 JS modules), no build step
- Supabase (Postgres, Auth, Storage, Edge Functions) for backend
- Hosted on GitHub Pages
- PWA: installable, offline support
- Row-Level Security (RLS) in Supabase; admin actions via Edge Functions
- REST API for user/admin management
- Audit logging for sensitive actions

---

## Repository Structure

- `public/` — Static frontend (HTML, JS, CSS, PWA, modules)
- `supabase/` — Config, SQL migrations, Edge Functions
- `docs/` — Documentation
- `.github/workflows/` — CI/CD for deploys
- `scripts/` — Admin/dev helper scripts

---

## Development

- Requires a Supabase project (see `supabase/config.toml`)
- Use npm scripts for Supabase CLI tasks
- No build step: edit and reload in browser

---

## Help

- Use the in-app “Help” button
- Contact your club administrator for issues

---

## Developers

See `docs/technical-architecture.md` for full details.
npm run sb:functions:deploy:dev
npm run sb:functions:deploy:prod
```

This uses `npx supabase` under the hood and does not require a global Supabase CLI install.
You can also call the CLI directly with `npx supabase ...`.

### Running Locally

Because the application uses ES6 modules, it must be served over HTTP (not opened directly as a file). Use any static file server:

```bash
# Using Python
cd public && python -m http.server 8000

# Using Node.js
npx http-server public -p 8000
```

Then open `http://localhost:8000/` in your browser.

### Remote Supabase dev environment (recommended)

The app now auto-selects environment by hostname:

- `localhost` / `127.0.0.1` -> `dev`
- any `dev` subdomain/host (for example `dev.your-domain.tld`, `dev-your-app.vercel.app`) -> `dev`
- all other hosts -> `prod`

`dev` is configured to target the remote Supabase dev project:

- URL: `https://nkzsjyzhpvivfgslzltn.supabase.co`
- Publishable key: `sb_publishable_lHFJ9uxG0ZgkCeONR3PXyA_Jf8Lx_p_`

Use these commands to apply backend changes to that dev project:

```bash
supabase login
supabase link --project-ref nkzsjyzhpvivfgslzltn
supabase db push --project-ref nkzsjyzhpvivfgslzltn
supabase config push --project-ref nkzsjyzhpvivfgslzltn
```

Safe npm wrappers are available for both environments:

```bash
# Database schema migrations
npm run sb:db:push:dev
npm run sb:db:push:prod

# Auth URL configuration (site_url + redirects)
npm run sb:config:push:dev
npm run sb:config:push:prod

# Edge Functions
npm run sb:functions:deploy:dev
npm run sb:functions:deploy:prod
```

`sb:config:push:*` temporarily applies `supabase/config.<env>.toml`, runs the push, then restores `supabase/config.toml` automatically.
This prevents accidental cross-environment `site_url` overwrites.

If needed, you can still override dev credentials from the browser using localStorage keys `jct.dev.supabase.url` and `jct.dev.supabase.key`.

You can manually force an environment from any URL:

- `?env=dev` forces `dev` (persisted in localStorage)
- `?env=prod` forces `prod`
- `?env=auto` clears the override and returns to the default (prod on the live app, dev on localhost)

Note: `?env=dev` / `?env=prod` are persisted in localStorage (`jct.env.override`) until you use `?env=auto`.

### Daily environment switch (quick routine)

Use this sequence to avoid mixing frontend code, backend project, and host:

```bash
# DEV work

git switch dev
npm run env:dev
# Test at: https://jccattenom.cantarero.fr/?env=dev

# PROD release/check

git switch main
npm run env:prod
# open: https://jccattenom.cantarero.fr/
```

## All-in-one environment commands

For most cases, use these single commands to update everything for dev or prod:

```bash
# DEV
npm run env:dev

# PROD
npm run env:prod
```

These run DB migrations, config push, and function deploy in sequence for the selected environment.

Frontend runtime selection — the same app URL is used for both environments:

- `https://jccattenom.cantarero.fr/` → prod Supabase (default)
- `https://jccattenom.cantarero.fr/?env=dev` → dev Supabase
- `?env=prod` forces prod, `?env=auto` clears the override and returns to the default

> **Tip:** `?env=dev` is persisted in `localStorage` (`jct.env.override`) so you only need to add it once per browser. Use `?env=auto` to go back to prod.

### Deployment

> **TL;DR — recommended split:**  
> Use **Supabase** for the backend (auth, database, storage) and a dedicated static host for the frontend. Dedicated hosts give clean, professional URLs and one-click deployments at no cost.

#### Hosting option comparison

| Platform | Resulting URL | Cost | Setup effort |
|----------|--------------|------|--------------|
| **GitHub Pages** ⭐ | `https://gaelc08.github.io/judo-coach-tracker/` | Free | Workflow included |
| **Vercel** | `https://judo-coach-tracker.vercel.app` | Free | `npx vercel --prod` |

---

**Option A — GitHub Pages (automatic CI/CD, no external account needed)**

A GitHub Actions workflow is already included in `.github/workflows/deploy-pages.yml`. To activate it:

1. Go to your repository on GitHub → **Settings** → **Pages**.
2. Under *Source*, select **GitHub Actions**.
3. Push to `main` (or trigger the workflow manually from the **Actions** tab).

Live URL: `https://gaelc08.github.io/judo-coach-tracker/`

---

**Option B — Vercel**

```bash
npx vercel --prod
```

Set the output directory to `public` when prompted.

Live URL: `https://judo-coach-tracker.vercel.app`

---

**Any HTTP server (local / self-hosted)**

```bash
# Using Python
cd public && python -m http.server 8000

# Using Node.js
npx http-server public -p 8000
```

---

#### Deploying the Supabase Edge Functions

A GitHub Actions workflow (`.github/workflows/deploy-supabase.yml`) automatically deploys the Supabase Edge Functions (`invite-coach`, `alert-admin`, etc.) whenever code under `supabase/functions/` is pushed to `main`.

The workflow authenticates with Supabase using a personal access token stored as a GitHub Actions secret.  You must add this secret once before the workflow can succeed:

1. Generate a personal access token at <https://app.supabase.com/account/tokens>.
2. In this repository, go to **Settings** → **Secrets and variables** → **Actions**.
3. Click **New repository secret**.
4. Name: `SUPABASE_ACCESS_TOKEN` — Value: the token you generated above.
5. Click **Add secret**.

After adding the secret, re-run the failed workflow from the **Actions** tab (select the run → **Re-run all jobs**) or push a change to `supabase/functions/` to trigger a fresh deploy.

> **Note**: without this secret the deploy step will fail with *"Access token not provided"*.

Manual deploy shortcuts are also available:

```bash
npm run sb:functions:deploy:dev
npm run sb:functions:deploy:prod
```

These commands deploy `invite-coach`, `invite-admin`, `delete-coach-user`, and `alert-admin` to the selected project.

---

## Configuration

### Supabase Setup

The Supabase project URL and public (anon) key are embedded directly in `public/app-modular.js`. To use a different Supabase project, update these values at the top of the file:

```js
const SUPABASE_URL = 'https://<your-project-id>.supabase.co';
const SUPABASE_ANON_KEY = '<your-anon-key>';
```

Required Supabase resources:

1. **Authentication** — enable email/password sign-in.
2. **Database** — create the `users` and `time_data` tables (see [Data Models](#data-models)).
3. **Storage** — create a public bucket named `justifications` for toll receipt uploads (see below).
4. **Row-Level Security** — configure RLS policies so each coach can only access their own rows.

#### Configuring the Site URL (required for password-reset emails)

Supabase embeds its configured **Site URL** into every auth email it sends (including password-reset links).  If this value is wrong, reset links will point to the wrong domain.

1. Open the [Supabase dashboard](https://app.supabase.com) → your project → **Authentication** → **URL Configuration**.
2. Set **Site URL** to `https://jccattenom.cantarero.fr` (or your actual deployment URL).
3. Under **Redirect URLs**, add every additional origin the app may be served from, e.g.:
   - `https://gaelc08.github.io/judo-coach-tracker`
   - `https://gaelc08.github.io/judo-coach-tracker/`
   - `https://gaelc08.github.io/judo-coach-tracker/?env=dev` (for dev Supabase testing via URL param)
4. Save.

These values are mirrored in `supabase/config.toml` (`[auth]` section) so that the Supabase CLI can push them:

```bash
supabase link --project-ref <your-project-ref>
supabase config push
```

> **Why this matters**: the application calls `supabase.auth.resetPasswordForEmail()` with a `redirectTo` value equal to the current page URL.  Supabase will only honour that redirect URL if it matches one of the registered Redirect URLs above; otherwise it falls back to the Site URL.

#### Applying database migrations

The `supabase/migrations/` folder contains SQL migrations that must be applied to your Supabase project.  Run them all at once with the Supabase CLI:

```bash
supabase db push --project-ref <your-project-ref>
```

Or paste each file individually into the **Supabase SQL editor** (Dashboard → SQL Editor → New query → paste → Run).

The migrations set up, in order:

| File | What it creates |
|------|----------------|
| `20240101000000_create_justifications_bucket.sql` | `justifications` storage bucket + RLS policies |
| `20250101000000_create_is_admin_function.sql` | `public.is_admin()` function used by RLS and the admin RPC check |
| `20260309150000_create_frozen_timesheets.sql` | `frozen_timesheets` table + RLS policies |
| `20260310000000_add_coach_invite_support.sql` | `claim_coach_profile()` function — lets a coach atomically claim a profile with `owner_uid = NULL` on first login |
| `20260310120000_fix_coaches_rls_for_invite_flow.sql` | Replaces the profile table RLS policies so admins can INSERT profiles with `owner_uid = NULL` (required for the invitation flow) |
| `20260311084000_drop_legacy_frozen_timesheet_tables.sql` | Removes duplicate legacy frozen-timesheet tables after copying any rows into `frozen_timesheets` |
| `20260311101500_make_claim_coach_profile_case_insensitive.sql` | Updates `claim_coach_profile()` so invited coach profiles are matched case-insensitively by e-mail |
| `20260311113000_drop_legacy_admins_and_timesheet_freezes.sql` | Removes the legacy `admins` and `timesheet_freezes` tables after preserving any useful frozen-timesheet rows |

#### Marking a user as admin

The `is_admin()` function reads the `is_admin` flag from the user's `app_metadata` JWT claim.  Set it via the Supabase dashboard or Admin API:

- **Dashboard**: Authentication → Users → select the user → expand *App Metadata* → set `{ "is_admin": true }`.
- **Admin API** (`service_role` key required):
  ```bash
  curl -X PUT https://<project-ref>.supabase.co/auth/v1/admin/users/<user-id> \
    -H "apikey: <service-role-key>" \
    -H "Authorization: Bearer <service-role-key>" \
    -H "Content-Type: application/json" \
    -d '{"app_metadata": {"is_admin": true}}'
  ```

Optional SQL maintenance helpers are stored in:

- [supabase/sql/admin/set-admin-user.sql](supabase/sql/admin/set-admin-user.sql)
- [supabase/sql/admin/create-or-promote-admin-user.sql](supabase/sql/admin/create-or-promote-admin-user.sql)

> **Troubleshooting — "Erreur lors du gel : Could not find the table 'public.frozen_timesheets' in the schema cache"**
>
> This error means the `frozen_timesheets` table does not exist in your Supabase project.  Apply the migrations above to create it.  Make sure to run `20250101000000_create_is_admin_function.sql` **before** `20260309150000_create_frozen_timesheets.sql` since the table's RLS policies depend on `public.is_admin()`.  If your project already has an older duplicate frozen-timesheet table, also apply `20260311084000_drop_legacy_frozen_timesheet_tables.sql` so `frozen_timesheets` remains the only table in use.

> **Troubleshooting — "Bucket not found" error when viewing a receipt**
>
> This error means the `justifications` bucket does not exist (or was deleted) in your Supabase project.  Run the `20240101000000_create_justifications_bucket.sql` migration to recreate it.

> **Troubleshooting — Admin cannot create a new profile (save returns no data / RLS error)**
>
> The profile table RLS INSERT policy may still require `owner_uid = auth.uid()`, which rejects inserts with `owner_uid = NULL`.  Apply `20260310120000_fix_coaches_rls_for_invite_flow.sql` to replace the policies with ones that allow admins to insert profiles with a null owner UID.

#### Personalising the invitation e-mail (French template)

The invitation e-mail sent to coaches is generated entirely by Supabase and cannot be changed through application code.  To set the **French** invitation e-mail template, configure it directly in the Supabase dashboard:

1. Open the [Supabase dashboard](https://app.supabase.com) → your project → **Authentication** → **Email Templates**.
2. Select the **Invite user** template.
3. Replace the subject and body with the French text below (adapt as needed):

**Subject:**
```
Invitation à rejoindre Judo Club de Cattenom-Rodemack
```

**Body (HTML):**
```html
<h2>Bienvenue dans l'équipe !</h2>
<p>Bonjour,</p>
<p>Vous avez été invité(e) à rejoindre l'application de suivi des entraîneurs du <strong>Judo Club de Cattenom-Rodemack</strong>.</p>
<p>Cliquez sur le bouton ci-dessous pour créer votre mot de passe et accéder à l'application :</p>
<p><a href="{{ .ConfirmationURL }}" style="background:#c0392b;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Créer mon mot de passe</a></p>
<p>Si vous n'attendiez pas cette invitation, ignorez ce message.</p>
<p>Cordialement,<br>L'équipe du Judo Club de Cattenom-Rodemack</p>
```

4. Click **Save**.

> **Note:** the `{{ .ConfirmationURL }}` placeholder is automatically replaced by Supabase with the correct invite link that redirects to your application.  The app detects this link and shows a dedicated "Créer votre mot de passe" screen immediately upon arrival, so coaches are never confused by the generic login form.

---


### Supabase — `users` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Auto-generated identifier |
| `name` | TEXT | Coach surname |
| `first_name` | TEXT | Coach first name |
| `email` | TEXT | Coach email address |
| `address` | TEXT | Home address |
| `vehicle` | TEXT | Vehicle description |
| `fiscal_power` | TEXT | Vehicle fiscal power (CV) |
| `hourly_rate` | DECIMAL | Payment per training hour (€) |
| `daily_allowance` | DECIMAL | Payment per competition day (€) |
| `km_rate` | DECIMAL | Payment per kilometre (€, default 0.35) |
| `owner_uid` | UUID | Supabase Auth user ID of the coach |

### Supabase — `time_data` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Auto-generated identifier |
| `coach_id` | UUID (FK) | References `users.id` |
| `date` | DATE | Entry date (YYYY-MM-DD) |
| `hours` | DECIMAL | Training hours for that day |
| `competition` | BOOLEAN | Whether this was a competition day |
| `km` | DECIMAL | Kilometres travelled |
| `description` | TEXT | Competition or trip description |
| `departure_place` | TEXT | Departure location |
| `arrival_place` | TEXT | Arrival location |
| `peage` | DECIMAL | Toll amount (€) |
| `justification_url` | TEXT | URL of the uploaded toll receipt |
| `owner_uid` | UUID | Supabase Auth user ID of the coach |
| `owner_email` | TEXT | Email of the coach |

### Supabase Storage — `justifications` bucket

Toll receipt files are stored at the path `{user_id}/{date}_{filename}`.

### Supabase — `frozen_timesheets` table

Tracks which coach/month combinations have been locked by an admin to prevent further edits.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Auto-generated identifier |
| `coach_id` | UUID (FK) | References `users.id` (cascade deletes) |
| `month` | TEXT | Locked month in `YYYY-MM` format |
| `frozen_at` | TIMESTAMPTZ | When the timesheet was frozen |
| `frozen_by` | TEXT | Email of the admin who froze the timesheet |

A unique constraint on `(coach_id, month)` ensures each month can only be frozen once.  RLS policies allow all authenticated users to read freeze status, but only admins (as determined by `public.is_admin()`) can insert or delete rows.

---

## Application Pages

### Coach Application

**URL:** `/` (`index.html`)

The coach application allows authenticated coaches to:

1. Register or log in with email and password.
2. Select a month to view or edit.
3. Click any calendar day to open the day entry modal.
4. Review the summary panel showing total hours, competition days, distance, and total payment.
5. Export a salary CSV or mileage HTML report.

Administrators log in through the same application. Once authenticated as an admin, additional controls become available to manage coach profiles and view any coach's data.

---

## Usage

### For Coaches

1. **Register** — click *S'inscrire* and create an account with your email.
2. **Log in** — click *Se connecter* and enter your credentials.
3. **Select a month** — use the month picker to navigate to the desired month.
4. **Add an entry** — click on any day in the calendar.
   - Enter the number of training hours.
   - Check *Compétition* if you attended a competition that day and fill in travel details.
   - Upload a toll receipt if applicable.
   - Click *Enregistrer*.
5. **Review the summary** — the panel below the calendar shows totals and payment amounts.
6. **Export** — use the export buttons to download a salary CSV or a printable mileage note.

### For Administrators

1. **Log in** to the application with your Supabase admin credentials.
2. **Manage coaches** — use *Ajouter un coach* or *Modifier le coach* to maintain coach profiles and set their rates.
3. **View coach data** — select a coach and month from the dropdowns.
4. **Export a mileage note** — click the export button to generate a printable report for the selected coach and month.

---

## Export Formats

### Timesheet (PDF / HTML)

Exported from the application. Generates a formatted page optimized for PDF printing including:

- Coach name, status, and hourly rate.
- Month and year recap.
- Total hours worked per day (when > 0).
- Total amount due.
- Club header with logo and signature blocks.

### Salary CSV

Exported from the coach application. Contains one row per day with columns for date, hours, competition flag, and payment calculations. Suitable for import into spreadsheet software.

### Mileage Note (PDF / HTML)

Exported from the application. Generates a formatted HTML page optimized for PDF printing including:

- Coach name, address, and vehicle details.
- A table of competition travel entries (date, departure, arrival, km, tolls).
- Total distance and reimbursement amount.
- Club header with logo.

The HTML page can be printed directly from the browser or saved as a PDF using the browser's print-to-PDF function.
