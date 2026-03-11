# Technical Architecture

## 1. Purpose

This document describes the technical architecture of the Judo Club de Cattenom-Rodemack coaching and expense application.

The application supports:

- authentication for coaches, volunteers, and administrators
- monthly timesheet entry on a calendar UI
- competition, mileage, toll, hotel, and purchase expense capture
- receipt upload to Supabase Storage
- administrative profile management and invitations
- monthly declaration and expense exports
- month freezing to prevent edits after validation

The system is intentionally lightweight: the frontend is a static single-page application and Supabase provides the backend platform services.

---

## 2. Architectural Overview

### 2.1 High-level view

```mermaid
flowchart TD
    User[Coach / Volunteer / Admin]
    Browser[Static SPA in browser\nHTML + CSS + Vanilla JS]
    Hosting[Static hosting\nGitHub Pages / Firebase Hosting / custom host]
    Auth[Supabase Auth]
    DB[Supabase Postgres\nusers, time_data, frozen_timesheets]
    Storage[Supabase Storage\njustifications bucket]
    Edge[Supabase Edge Functions\ninvite-coach, invite-admin, delete-coach-user, app]
    External1[French public holiday API]
    External2[French school holiday API]

    User --> Browser
    Hosting --> Browser
    Browser --> Auth
    Browser --> DB
    Browser --> Storage
    Browser --> Edge
    Browser --> External1
    Browser --> External2
```

### 2.2 Architectural style

The application follows a pragmatic frontend-heavy architecture:

- **presentation, state, and orchestration** live mainly in the browser
- **persistence, authentication, RLS, and file storage** are delegated to Supabase
- **administrative privileged actions** are handled by Edge Functions using the service role key
- **deployment** is static for the frontend and serverless for the backend functions

This keeps infrastructure simple while still enforcing security server-side through Supabase Row-Level Security (RLS).

---

## 3. Repository Structure

```text
judo-coach-app/
├── .github/workflows/
│   ├── deploy-pages.yml
│   └── deploy-supabase.yml
├── docs/
│   └── technical-architecture.md
├── public/
│   ├── index.html
│   ├── app-modular.js
│   ├── style.css
│   ├── sw.js
│   ├── manifest.webmanifest
│   └── admin.html / admin-app.js / app.js (legacy/older entry points)
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   ├── functions/
│   │   ├── app/
│   │   ├── invite-coach/
│   │   ├── invite-admin/
│   │   └── delete-coach-user/
│   └── sql/admin/
├── scripts/
├── firebase.json
├── package.json
└── README.md
```

### 3.1 Key directories

- `public/`: production frontend assets
- `supabase/migrations/`: database schema and RLS evolution
- `supabase/functions/`: privileged serverless operations
- `.github/workflows/`: CI/CD automation
- `docs/`: project documentation

---

## 4. Frontend Architecture

## 4.1 Runtime model

The frontend is a **static SPA** loaded from `public/index.html`.

Main runtime characteristics:

- no bundler
- no frontend framework
- ES module import of Supabase client from CDN
- application logic concentrated in `public/app-modular.js`
- CSS styling in `public/style.css`
- offline shell and cache management via `public/sw.js`

## 4.2 Main frontend files

- `public/index.html`
  - single application shell
  - auth area, toolbar, calendar, summary, modals, help content
- `public/app-modular.js`
  - Supabase client creation
  - auth/session handling
  - in-memory state
  - data loading
  - calendar rendering
  - day editing and persistence
  - exports
  - admin flows
  - holiday fetching
  - PWA install support
- `public/style.css`
  - shared application styling
  - calendar status colors
  - modal, toolbar, summary, export layout styles
- `public/sw.js`
  - app-shell caching
  - offline fallback
  - cache version invalidation
- `public/manifest.webmanifest`
  - PWA metadata and app icons

## 4.3 Frontend state model

The app uses in-memory state variables rather than a formal store.

Core state includes:

- `coaches` / user profiles loaded from Supabase
- `timeData` keyed by `coach_id-date`
- `currentCoach`
- `currentMonth`
- `selectedDay`
- `currentUser`, `currentSession`, `currentAccessToken`
- `frozenMonths`
- in-memory caches for holiday data

This approach is simple and effective for the app size, but it makes `app-modular.js` a central orchestration file.

## 4.4 UI composition

The main screen is composed of:

- **authentication panel**
- **header and toolbar**
- **profile selector**
- **month selector**
- **calendar grid**
- **monthly summary panel**
- **export actions**
- **coach profile modal**
- **day-entry modal**
- **help modal**
- **password/invite onboarding modals**

## 4.5 PWA behavior

The app includes progressive web app capabilities:

- install prompt support in the browser
- service worker registration from the SPA
- cache-busted static assets using a build ID
- offline shell support for static assets

`public/sw.js` caches:

- `index.html`
- `style.css`
- `app-modular.js`
- `manifest.webmanifest`
- logo assets
- offline page

---

## 5. Backend Architecture

## 5.1 Supabase services used

The application relies on the following Supabase services:

- **Auth** for email/password accounts and invitations
- **Postgres** for domain data
- **Storage** for uploaded receipts
- **Edge Functions** for privileged admin operations
- **PostgREST / RPC** for database access from the browser

## 5.2 Database model

### `public.users`

Profile table for both coaches and volunteers.

Main responsibilities:

- stores personal and payroll-related profile data
- links a business profile to a Supabase auth account via `owner_uid`
- distinguishes profile type (`coach` vs `benevole`)
- keeps legacy display role aligned (`entraineur` vs `benevole`)

Representative fields:

- `id`
- `name`
- `first_name`
- `email`
- `address`
- `vehicle`
- `fiscal_power`
- `hourly_rate`
- `daily_allowance`
- `km_rate`
- `profile_type`
- `role`
- `owner_uid`

### `public.time_data`

Stores day-level activity and expense entries.

Responsibilities:

- training-hour capture
- competition-day capture
- travel and mileage details
- toll, hotel, and purchase expenses
- receipt URL persistence
- ownership and audit linkage back to a profile/user

Representative fields:

- `id`
- `coach_id`
- `date`
- `hours`
- `competition`
- `km`
- `description`
- `departure_place`
- `arrival_place`
- `peage`
- `hotel`
- `achat`
- `justification_url`
- `hotel_justification_url`
- `achat_justification_url`
- `owner_uid`
- `owner_email`

Important constraint:

- unique day row per profile/date pair

### `public.frozen_timesheets`

Controls edit locking at monthly granularity.

Responsibilities:

- records a frozen month per profile
- blocks write operations for non-admin users on locked months
- allows UI to show a frozen banner and disable edits

Representative fields:

- `id`
- `coach_id`
- `month`
- `frozen_at`
- `frozen_by`

### Storage bucket: `justifications`

Used for receipt upload and retrieval.

Typical object naming strategy:

- `{user_id}/{date}_{prefix}_{filename}`

Supported files include:

- PDF
- JPG
- PNG

## 5.3 Security model

Security is shared between:

- **client-side UX checks** for user feedback
- **server-side RLS** for actual enforcement
- **Edge Functions** for actions that require service-role privileges

### Authentication

Users authenticate with Supabase Auth.

Important patterns in the app:

- persistent browser session
- password reset support
- invite-link onboarding
- local JWT inspection for fast admin detection
- fallback RPC check through `public.is_admin()`

### Authorization

The main authorization concepts are:

- normal users can access only their own profile and entries
- admins can access all profiles and entries
- frozen months block writes for non-admin users
- invitation and deletion flows run through Edge Functions, not directly in the client

### RLS and helper functions

Key helper functions and policy concepts include:

- `public.is_admin()` reads `app_metadata.is_admin` from the JWT
- `public.claim_user_profile()` atomically links an invited profile to the first authenticated account with the matching email
- `public.claim_coach_profile()` remains as a compatibility wrapper
- explicit `time_data` RLS policies enforce ownership/admin/frozen-month rules

---

## 6. Edge Functions

## 6.1 `invite-coach`

Purpose:

- lets an admin send an invitation email to a coach profile

Behavior:

- validates caller identity from bearer token
- checks admin access
- calls Supabase Admin API `inviteUserByEmail`
- uses configured `redirectTo` URL or site URL fallback

Why it exists:

- invitation requires privileged auth admin operations
- service role key must never be exposed to the browser

## 6.2 `invite-admin`

Purpose:

- invites a new administrator or upgrades an existing user to admin

Behavior:

- validates caller admin access
- invites by email when needed
- updates `app_metadata.is_admin = true`

## 6.3 `delete-coach-user`

Purpose:

- deletes the linked Supabase Auth user of a coach profile

Behavior:

- validates caller admin access
- resolves user by explicit `userId` or email lookup
- deletes the auth account through the admin API

## 6.4 `app`

Purpose:

- optional static SPA host served from Supabase Edge Functions

Behavior:

- serves `index.html` for routes
- serves static assets with correct MIME types
- injects a `<base>` tag for nested routing compatibility

This is an alternative hosting path, not the only deployment mode.

---

## 7. Key Business Flows

## 7.1 Standard login flow

1. user opens SPA
2. Supabase client restores session if present
3. app determines whether the user is admin
4. app loads profiles, day data, and frozen months
5. UI renders calendar and monthly totals

## 7.2 Invite and claim flow

1. admin creates a profile in `public.users`, optionally with `owner_uid = NULL`
2. admin triggers `invite-coach`
3. invited user receives Supabase invitation email
4. user follows link and sets password
5. frontend calls `claim_user_profile()` / compatibility wrapper
6. matching unclaimed profile is linked to `auth.uid()`
7. future reads and writes work through normal RLS

## 7.3 Day save flow

1. user opens a day modal
2. frontend computes entry payload
3. if needed, receipt files are uploaded first to Storage
4. frontend checks whether a day row already exists
5. app performs insert, update, or delete on `public.time_data`
6. RLS validates ownership/admin access and frozen-month rules
7. local in-memory cache is updated and summary/calendar rerendered

## 7.4 Freeze flow

1. admin selects profile and month
2. admin toggles freeze state
3. frontend writes to `public.frozen_timesheets`
4. non-admin writes for that month are blocked both in UI and DB policies

## 7.5 Export flow

The frontend generates exports client-side.

### Salary declaration export

- generated as real `.xlsx`
- built in-browser using ExcelJS loaded dynamically
- includes club branding and formatting
- suitable for Excel or PDF printing

### Expense note export

- generated as printable HTML
- intended for browser print / PDF
- includes mileage, toll, hotel, and purchase expenses

### JSON backup

- exports month data for backup/import use cases

---

## 8. External Integrations

## 8.1 Public holidays API

Used to color French public holidays in the calendar.

Characteristics:

- fetched dynamically at runtime
- cached in memory per year
- static fallback data available if network request fails

## 8.2 School holidays API

Used to highlight school holiday periods in the calendar.

Characteristics:

- fetched dynamically from French open data
- filtered by `zones = "Zone B"`
- deduplicated in the frontend because API results are location-based
- static fallback data available for resilience

---

## 9. Deployment Architecture

## 9.1 Frontend hosting

The frontend is static and can be hosted on:

- GitHub Pages
- Firebase Hosting
- custom static hosting
- optional Supabase Edge Function host (`functions/app`)

### Current repository support

- `.github/workflows/deploy-pages.yml` deploys `public/` to GitHub Pages on push to `main`
- `firebase.json` provides SPA rewrites for Firebase Hosting

## 9.2 Backend deployment

Supabase backend assets are deployed separately:

- database migrations via Supabase CLI
- auth/site URL settings via `supabase config push`
- Edge Functions via `.github/workflows/deploy-supabase.yml`

## 9.3 Environment and configuration

Central Supabase configuration lives in:

- `public/app-modular.js` for project URL and anon key
- `supabase/config.toml` for project ref, auth site URL, redirect URLs, and function settings

Important operational settings:

- `project_id = "ajbpzueanpeukozjhkiv"`
- canonical site URL is `https://jccattenom.cantarero.fr/`
- GitHub Pages URLs are included as allowed redirect URLs

---

## 10. Observability and Debugging

The frontend includes built-in diagnostic logging, especially around:

- fetch calls to Supabase
- auth/session initialization
- admin detection
- invitation flow diagnostics
- service worker registration

This is useful because the system depends heavily on:

- browser session state
- JWT claims
- RLS behavior
- external APIs

The recent architecture evolution also introduced explicit compatibility and cleanup migrations to remove legacy references such as `timesheet_freezes` after schema changes.

---

## 11. Architectural Strengths

- very low infrastructure footprint
- no frontend build pipeline required
- strong security boundary through Supabase RLS
- privileged actions isolated in Edge Functions
- easy static deployment
- practical offline/PWA support
- export generation kept in-browser to reduce backend complexity

---

## 12. Architectural Constraints and Risks

## 12.1 Large frontend module

`public/app-modular.js` centralizes many concerns:

- auth
- data access
- state management
- rendering
- exports
- admin workflows
- diagnostics

This makes iteration fast, but increases maintenance cost and regression risk.

## 12.2 Embedded public configuration

The frontend contains the public Supabase URL and anon key. This is acceptable for Supabase public clients, but all sensitive operations must remain protected by:

- RLS
- Edge Functions with service role keys on the server side only

## 12.3 Schema evolution sensitivity

Because authorization depends on RLS and SQL helper functions, schema renames must be accompanied by:

- migration updates
- compatibility rollouts when needed
- remote database cleanup of legacy objects

## 12.4 Client-side exports

Client-side document generation reduces backend load, but it means:

- export logic is coupled to frontend code
- PDF fidelity depends on browser print behavior
- large exports may stress lower-end devices

---

## 13. Recommended Future Improvements

### Short term

- split `app-modular.js` into focused modules:
  - auth
  - data access
  - calendar
  - exports
  - admin
  - utilities
- add a dedicated architecture decision log
- align README export descriptions with the current XLSX/expense implementation
- reduce production debug logging once stability is confirmed

### Medium term

- introduce automated integration tests for critical flows:
  - invite and claim
  - save/update/delete day entry
  - frozen-month enforcement
  - export smoke tests
- add migration smoke checks for renamed relations and policy dependencies
- document RLS policies more formally in a dedicated security document

### Long term

- move from monolithic script to a typed modular frontend structure
- centralize configuration through environment substitution at deploy time
- add structured audit history for admin actions and month freezing

---

## 14. Summary

The application is a static browser-based operations tool backed by Supabase.

Its architecture is optimized for simplicity:

- **frontend**: static SPA with vanilla JavaScript
- **backend**: Supabase Auth, Postgres, Storage, Edge Functions
- **security**: JWT claims + RLS + service-role serverless functions
- **deployment**: static hosting plus serverless backend deployment

This design is well suited to a small administrative application with moderate complexity, fast iteration needs, and limited infrastructure overhead.
