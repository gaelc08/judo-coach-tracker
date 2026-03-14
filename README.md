# Judo Coach Tracker

A web application for tracking judo coach training hours, competition days, mileage, and generating expense reports for **Judo Club de Cattenom-Rodemack**.

Technical documentation:

- [Technical Architecture](docs/technical-architecture.md)

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Running Locally](#running-locally)
  - [Deployment](#deployment)
    - [Deploying Edge Functions](#deploying-the-supabase-edge-functions)
- [Configuration](#configuration)
  - [Supabase Setup](#supabase-setup)
  - [French Invite Email Template](#personalising-the-invitation-e-mail-french-template)
- [Data Models](#data-models)
- [Application Pages](#application-pages)
  - [Coach Application](#coach-application)
- [Usage](#usage)
  - [For Coaches](#for-coaches)
  - [For Administrators](#for-administrators)
- [Export Formats](#export-formats)
- [Technical Architecture](docs/technical-architecture.md)

---

## Overview

Judo Coach Tracker is a client-side web application that allows judo coaches to log their working hours, competition days, travel distances, and toll expenses. Administrators can view all coaches' data, manage coach profiles, and export reports.

The application is entirely static (HTML, CSS, and JavaScript) and relies on **Supabase** for authentication, data storage, and file uploads.

---

## Features

### Coach Features

- **Monthly calendar view** — visualise and enter data day by day.
- **Training hours** — record hours worked per day in 0.5-hour increments.
- **Competition days** — flag competition days and log travel details.
- **Mileage tracking** — record departure and arrival locations, distance (km), and tolls.
- **Receipt upload** — attach toll receipt files (PDF, JPG, PNG) per entry.
- **Summary panel** — real-time calculation of total hours, competition days, kilometres, and total payment.
- **CSV export** — export a salary summary spreadsheet.
- **Mileage note export** — export a printable HTML mileage report (suitable for printing to PDF).
- **Timesheet PDF export** — export a printable PDF report for the coach's monthly training hours.
- **JSON import/export** — import/export previous month's data from a JSON backup.

### Admin Features

- **Coach management** — create, edit, and delete coach profiles.
- **Rate configuration** — set hourly rate, daily competition allowance, and km rate per coach.
- **Read-only dashboard** — view any coach's calendar and summary for any month.
- **Audit Logs** — track all modifications and data exports within the app.
- **Admin Email Alerts** — automatically receive email notifications whenever a coach modifies data.
- **JSON Access** — securely import or export raw JSON payloads.
- **Mileage export** — export mileage notes on behalf of any coach.

### Calendar Highlights

Days are colour-coded for quick reference:

| Colour | Meaning |
|--------|---------|
| Green | Training hours recorded |
| Blue | Competition day |
| Gray | Weekend |
| Light orange | School holidays |
| Pink/Red | Public holidays (France) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, Vanilla JavaScript (ES6 modules) |
| Backend | [Supabase](https://supabase.com) (Auth, PostgreSQL, Storage) |
| Hosting | GitHub Pages (frontend) + Supabase (backend) |

No build tool or bundler is required — the application is served directly as static files.

---

## Project Structure

```
judo-coach-tracker/
├── .github/
│   └── workflows/
│       ├── deploy-pages.yml          # GitHub Pages auto-deploy on push to main
│       └── deploy-supabase.yml       # Supabase Edge Functions deploy on push to main
├── public/
│   ├── index.html        # Application entry point
│   ├── app-modular.js    # Application logic (Supabase)
│   ├── style.css         # Shared stylesheet
│   └── logo-jcc.png      # Club logo
├── supabase/
│   ├── config.toml       # Supabase project configuration
│   ├── migrations/       # Timestamped database migrations applied in order
│   └── sql/
│       └── admin/        # Optional SQL maintenance helpers for admin users
└── package.json          # NPM dependencies
```

---

## Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Edge, Safari)
- A Supabase project (for authentication and data)

### Running Locally

Because the application uses ES6 modules, it must be served over HTTP (not opened directly as a file). Use any static file server:

```bash
# Using Python
cd public && python -m http.server 8000

# Using Node.js
npx http-server public -p 8000
```

Then open `http://localhost:8000/` in your browser.

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
