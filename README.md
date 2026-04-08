# Judo Coach Tracker

Web app for the Judo Club de Cattenom-Rodemack to manage coach and volunteer activity, expenses, mileage, and related club administration.

## What It Does

For coaches and volunteers:
- record training sessions, competition days, and travel entries in a monthly calendar
- track mileage, tolls, hotel costs, and club purchases
- upload supporting receipts for reimbursable expenses
- export monthly timesheets and expense reports

For administrators:
- manage user profiles and role-related data
- review and export activity across profiles
- invite users and perform privileged account actions through Supabase Edge Functions
- inspect audit logs for sensitive operations

## Current Stack

- static SPA in `public/` using HTML, CSS, and ES modules
- no bundler and no build step for the frontend
- Supabase for Auth, Postgres, Storage, and Edge Functions
- GitHub Pages deployment for the frontend
- installable PWA with offline fallback via service worker

## Repository Layout

- `public/`  frontend, styles, PWA assets, and browser modules
- `supabase/`  config files, SQL migrations, and Edge Functions
- `scripts/`  helper scripts for admin tasks and Supabase deploy/config flows
- `docs/`  project documentation
- `.github/workflows/`  GitHub Pages and Supabase deployment workflows
- `.github/agents/`  custom repo agents for implementation and review workflows

## Local Development

Prerequisites:
- Node.js
- access to the target Supabase projects

Install dependencies:

```bash
npm install
```

Serve the frontend over HTTP from the `public/` directory because the app uses ES modules:

```bash
# Python
cd public && python -m http.server 8000

# Node.js
npx http-server public -p 8000
```

Then open `http://localhost:8000/`.

## Environment Routing

Frontend environment selection is centralized in `public/modules/env.js`.

Resolution order:
- URL parameter `?env=dev|prod` and persisted override
- persisted localStorage override `jct.env.override`
- hostname auto-detection

Current hostname behavior:
- `localhost` and `127.0.0.1` use `dev`
- hosts starting with `dev.` or `dev-` use `dev`
- everything else uses `prod`

You can clear a persisted override with:

```text
?env=auto
```

Production frontend host:
- `https://jccattenom.cantarero.fr/`

Useful URLs:
- `https://jccattenom.cantarero.fr/` for prod
- `https://jccattenom.cantarero.fr/?env=dev` for dev backend from the same frontend host

## Supabase Commands

The repository provides safe npm wrappers for environment-targeted backend updates:

```bash
# Database migrations
npm run sb:db:push:dev
npm run sb:db:push:prod

# Auth/config push
npm run sb:config:push:dev
npm run sb:config:push:prod

# Edge Functions deploy
npm run sb:functions:deploy:dev
npm run sb:functions:deploy:prod

# Full environment update
npm run env:dev
npm run env:prod
```

These wrappers are preferred over ad hoc CLI commands because they keep dev and prod targeting explicit.

## Deployment

Frontend deployment:
- `.github/workflows/deploy-pages.yml` deploys the static app to GitHub Pages
- `public/CNAME` configures the custom domain `jccattenom.cantarero.fr`

Supabase deployment:
- `.github/workflows/deploy-supabase.yml` deploys Edge Functions
- SQL migrations are applied through the Supabase CLI using the npm wrappers above

Current Edge Functions:
- `alert-admin`
- `app`
- `delete-coach-user`
- `export-monthly-expenses`
- `invite-admin`
- `invite-coach`

## Data and Security Notes

- profile and activity data are stored in Supabase Postgres
- receipts are stored in the `justifications` Storage bucket
- Row-Level Security protects direct data access
- privileged account and admin operations go through Edge Functions rather than exposing service-role capabilities to the browser

## Related Docs

- see `docs/technical-architecture.md` for the architecture overview and data model summary
