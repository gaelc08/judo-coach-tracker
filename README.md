# Judo Coach Tracker

A web application for tracking judo coach training hours, competition days, mileage, and generating expense reports for **Judo Club de Cattenom-Rodemack**.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Running Locally](#running-locally)
  - [Deployment](#deployment)
- [Configuration](#configuration)
  - [Supabase Setup](#supabase-setup)
  - [Firebase Setup](#firebase-setup)
- [Data Models](#data-models)
- [Application Pages](#application-pages)
  - [Coach Application](#coach-application)
  - [Admin Dashboard](#admin-dashboard)
- [Usage](#usage)
  - [For Coaches](#for-coaches)
  - [For Administrators](#for-administrators)
- [Export Formats](#export-formats)

---

## Overview

Judo Coach Tracker is a client-side web application that allows judo coaches to log their working hours, competition days, travel distances, and toll expenses. Administrators can view all coaches' data, manage coach profiles, and export reports.

The application is entirely static (HTML, CSS, and JavaScript) and relies on two cloud backends:

- **Supabase** — used by coaches for authentication, data storage, and file uploads.
- **Firebase** — used by administrators for authentication and read-only data access.

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
- **JSON import** — import previous month's data from a JSON backup.

### Admin Features

- **Coach management** — create, edit, and delete coach profiles.
- **Rate configuration** — set hourly rate, daily competition allowance, and km rate per coach.
- **Read-only dashboard** — view any coach's calendar and summary for any month.
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
| Coach backend | [Supabase](https://supabase.com) (Auth, PostgreSQL, Storage) |
| Admin backend | [Firebase](https://firebase.google.com) (Auth, Firestore) |
| Hosting | Firebase Hosting |

No build tool or bundler is required — the application is served directly as static files.

---

## Project Structure

```
judo-coach-tracker/
├── public/
│   ├── index.html        # Coach application entry point
│   ├── admin.html        # Admin dashboard entry point
│   ├── app-modular.js    # Coach application logic (Supabase)
│   ├── admin-app.js      # Admin application logic (Firebase)
│   ├── style.css         # Shared stylesheet
│   └── logo-jcc.png      # Club logo
├── .firebaserc           # Firebase project reference
├── firebase.json         # Firebase hosting configuration
└── package.json          # NPM dependencies
```

---

## Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Edge, Safari)
- A Supabase project (for coach authentication and data)
- A Firebase project (for admin authentication and hosting)
- [Firebase CLI](https://firebase.google.com/docs/cli) (for deployment only)

### Running Locally

Because the application uses ES6 modules, it must be served over HTTP (not opened directly as a file). Use any static file server:

```bash
# Using Python
cd public && python -m http.server 8000

# Using Node.js
npx http-server public -p 8000
```

Then open:

- `http://localhost:8000/` — Coach application
- `http://localhost:8000/admin.html` — Admin dashboard

### Deployment

The application is hosted on Firebase Hosting.

```bash
# Install Firebase CLI (once)
npm install -g firebase-tools

# Authenticate
firebase login

# Deploy
firebase deploy --project judo-coach-tracker
```

Live URL: `https://judo-coach-tracker.web.app`

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
2. **Database** — create the `coaches` and `time_data` tables (see [Data Models](#data-models)).
3. **Storage** — create a bucket named `justifications` for toll receipt uploads.
4. **Row-Level Security** — configure RLS policies so each coach can only access their own rows.

### Firebase Setup

Firebase credentials are loaded via the CDN in `public/admin.html`. Update the `firebaseConfig` object in that file to point to your Firebase project:

```js
const firebaseConfig = {
  apiKey: '<your-api-key>',
  authDomain: '<your-project>.firebaseapp.com',
  projectId: '<your-project-id>',
  // ...
};
```

---

## Data Models

### Supabase — `coaches` table

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
| `coach_id` | UUID (FK) | References `coaches.id` |
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

### Admin Dashboard

**URL:** `/admin.html`

The admin dashboard requires a separate Firebase admin account. From here, administrators can:

1. Create, edit, and delete coach profiles including rates and personal details.
2. Select any coach and any month to view their calendar data.
3. Export a mileage note on behalf of a coach.

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

1. **Log in** to the admin dashboard with your Firebase admin credentials.
2. **Manage coaches** — use *Ajouter un coach* or *Modifier le coach* to maintain coach profiles and set their rates.
3. **View coach data** — select a coach and month from the dropdowns.
4. **Export a mileage note** — click the export button to generate a printable report for the selected coach and month.

---

## Export Formats

### Salary CSV

Exported from the coach application. Contains one row per day with columns for date, hours, competition flag, and payment calculations. Suitable for import into spreadsheet software.

### Mileage Note (HTML)

Exported from both the coach application and the admin dashboard. Generates a formatted HTML page including:

- Coach name, address, and vehicle details.
- A table of competition travel entries (date, departure, arrival, km, tolls).
- Total distance and reimbursement amount.
- Club header with logo.

The HTML page can be printed directly from the browser or saved as a PDF using the browser's print-to-PDF function.
