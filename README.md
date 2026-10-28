# CarePoint Clinic — Appointment Booking

A complete, production-ready clinic appointment booking application. Patients browse services and doctors, pick a live open time slot, and book in seconds. Doctors manage their week calendar. Admins run the whole clinic from one dashboard.

Built with **Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui + Prisma + PostgreSQL (Neon)** — and runs locally on **SQLite** with the exact same schema.

![Landing page](screenshots/01-landing.png)

## Table of contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Demo accounts](#demo-accounts)
- [Tech stack](#tech-stack)
- [Run locally on Windows](#run-locally-on-windows)
- [Environment variables](#environment-variables)
- [API overview](#api-overview)
- [How the slot engine works](#how-the-slot-engine-works)
- [How double-booking is prevented](#how-double-booking-is-prevented)
- [Timezone handling](#timezone-handling)
- [Testing](#testing)
- [Deploy on Vercel + Neon](#deploy-on-vercel--neon)
- [Project structure](#project-structure)
- [Roadmap](#roadmap)

## Features

**Patients (CUSTOMER)**
- Self-service registration and login (JWT session in an httpOnly cookie)
- Browse the service catalog and doctor directory (public pages)
- 4-step booking wizard: service → doctor (or *first available*) → date + live slot grid → notes + confirm
- Own appointment history with status badges (Booked / Cancelled / Completed / No-show)
- Cancel or reschedule upcoming appointments — blocked within 24 hours of the start, with a clear message
- Email confirmation, reschedule/cancellation notices, and a 24-hour reminder

**Doctors (STAFF)**
- Week calendar with day navigation, per-day appointment counts, working hours and time-off indicators
- Today’s and upcoming schedule, patient names, notes
- Mark appointments as **Completed** or **No-show** (only their own, only after the start time)

**Administrators (ADMIN)**
- Dashboard: today’s appointments, next-7-days bookings chart (Recharts), top services, cancellation rate
- Manage the service catalog (create / edit / soft-deactivate, prices in ETB)
- Create doctor accounts and assign the services they offer
- Edit each doctor’s weekly working hours (validated, no overlapping windows)
- Manage time off (holidays, leave) per doctor
- Browse and filter every appointment in the clinic

**Platform**
- Role-based access control enforced **on the server on every request** (the user is re-loaded from the database each time — the JWT never carries authority)
- Centralized error handling with consistent JSON envelopes (400 / 401 / 403 / 404 / 409)
- Zod validation on every input, TanStack Query on the client, fully responsive UI with loading / empty / error states, light & dark theme
- Reminder cron endpoint protected by a shared secret + `vercel.json` cron entry
- 28 unit tests (Vitest) covering the scheduling core

## Screenshots

| | |
|---|---|
| ![Login with quick-fill demo buttons](screenshots/02-login.png) | ![Booking wizard — slot picker](screenshots/04-book-slots.png) |
| ![Booking confirmation](screenshots/05-book-confirm.png) | ![Booking success](screenshots/06-book-success.png) |
| ![My appointments](screenshots/07-appointments.png) | ![Doctor week calendar](screenshots/08-doctor-schedule.png) |
| ![Admin dashboard](screenshots/09-admin-dashboard.png) | ![Admin — services](screenshots/10-admin-manage-services.png) |
| ![Admin — doctors](screenshots/10b-admin-doctors.png) | ![Admin — working hours & time off](screenshots/11-admin-hours.png) |
| ![Admin — all appointments](screenshots/12-admin-appointments.png) | ![Mobile landing](screenshots/13-mobile-landing.png) |

## Demo accounts

| Role | Email | Password | Lands on |
|---|---|---|---|
| Admin | `admin@clinic.demo` | `Admin123!` | `/admin` (dashboard) |
| Doctor | `doctor@clinic.demo` | `Doctor123!` | `/schedule` (week calendar) |
| Patient | `patient@clinic.demo` | `Patient123!` | `/book` (booking wizard) |

The login page has **one-click quick-fill buttons** for all three accounts. Demo accounts cannot change their password (403 with a clear message) so the shared credentials keep working. The seed also creates 3 doctors, 10 patients and ~45 appointments spread across the past and next 2 weeks — always relative to today, so the demo never goes stale.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript 5 (strict) |
| UI | Tailwind CSS 4, shadcn/ui (New York), lucide-react, Recharts, sonner |
| API | Next.js Route Handlers as a pure REST layer (`/api/*`) |
| Auth | JWT (jose, HS256) in an httpOnly cookie, bcryptjs hashing, server-side RBAC |
| Validation | Zod (every request body and query) |
| Data | Prisma ORM — SQLite locally, PostgreSQL (Neon) in production |
| Client data | TanStack Query v5 |
| Dates | date-fns + a dependency-free `Intl`-based timezone layer |
| Email | Resend (via `fetch`), console fallback without a key |
| Tests | Vitest (28 unit tests on the scheduling core) |

## Run locally on Windows

Prerequisites: **Node.js 18+** and npm. No WSL, no Docker, no extra tooling required.

```bat
git clone <your-repo-url> clinic-booking
cd clinic-booking

:: 1. install dependencies
npm install

:: 2. configure environment
copy .env.example .env
::    (edit JWT_SECRET / CRON_SECRET to random strings — see the table below)

:: 3. create the SQLite database and tables
npx prisma db push

:: 4. load demo data
npm run db:seed

:: 5. start the dev server
npm run dev
```

Open <http://localhost:3000> and use the demo quick-fill buttons on the login page.

Other useful commands:

```bat
npm test            :: run the Vitest suite (28 tests)
npm run lint        :: ESLint
npx tsc --noEmit    :: full type check (zero errors)
npm run db:studio   :: browse the database with Prisma Studio
npm run build       :: production build (prisma generate && next build)
npm start           :: run the production build
```

## Environment variables

Copy `.env.example` to `.env` and fill in the values. **Never commit `.env`.**

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | `file:../db/custom.db` | SQLite file (relative to `prisma/schema.prisma`) for local dev; a Neon PostgreSQL URL in production. |
| `JWT_SECRET` | yes | — | Secret used to sign session JWTs. **Minimum 16 characters.** Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CLINIC_TIMEZONE` | no | `Africa/Addis_Ababa` | IANA timezone used for **all** scheduling math and display. |
| `CRON_SECRET` | for cron | — | Shared secret required by `GET /api/cron/reminders` (`Authorization: Bearer <CRON_SECRET>`). Vercel Cron sends it automatically. |
| `RESEND_API_KEY` | no | — | When set, transactional emails are sent via Resend; when empty they are logged to the server console. |
| `EMAIL_FROM` | no | — | Verified sender identity, e.g. `CarePoint Clinic <bookings@yourdomain.com>`. |

## API overview

All routes return JSON. Errors always use the shape `{"error":{"code":"...","message":"..."}}` with status 400/401/403/404/409. 🔒 = requires the session cookie; roles are checked server-side on every request.

| Method & path | Roles | Description |
|---|---|---|
| `POST /api/auth/register` | public | Create a patient account, sets the session cookie. |
| `POST /api/auth/login` | public | Sign in (any role). |
| `POST /api/auth/logout` | 🔒 any | Clear the session cookie. |
| `GET /api/auth/me` | 🔒 any | Current user (re-loaded from the DB). |
| `POST /api/auth/change-password` | 🔒 any | Change password (blocked for `@clinic.demo` demo accounts). |
| `GET /api/services` | public | Active services; `?all=1` (admin) includes inactive. |
| `POST /api/services` | 🔒 admin | Create a service `{name, durationMinutes, price, active}`. |
| `PATCH /api/services/:id` | 🔒 admin | Update a service (partial). |
| `DELETE /api/services/:id` | 🔒 admin | Soft-deactivate (history is preserved). |
| `GET /api/staff` | public | Doctor directory with offered services. |
| `POST /api/staff` | 🔒 admin | Create a doctor account + profile + services. |
| `PATCH /api/staff/:id` | 🔒 admin | Update name / specialty / offered services. |
| `GET /api/staff/:id/working-hours` | 🔒 admin or that doctor | Weekly template. |
| `PUT /api/staff/:id/working-hours` | 🔒 admin | Replace the weekly template (validated: no overlaps, start < end). |
| `GET /api/staff/:id/time-off` | 🔒 admin or that doctor | List time off. |
| `POST /api/staff/:id/time-off` | 🔒 admin | Add time off `{startsAt, endsAt, reason}`. |
| `DELETE /api/time-off/:id` | 🔒 admin | Remove a time-off entry. |
| `GET /api/slots?serviceId&date&staffId?` | public | Open slots for a day (omit `staffId` for *any doctor* — slots include the free `staffIds`). |
| `GET /api/appointments` | 🔒 any | Role-scoped list (patient = own, doctor = own schedule, admin = all) with `date` / `from`+`to` / `scope=today` / `status` filters. |
| `POST /api/appointments` | 🔒 customer | Book `{serviceId, staffId, startsAt, notes}` — re-checks availability in a transaction; **409** if the slot was just taken. |
| `PATCH /api/appointments/:id` | 🔒 role-dependent | `{"action":"cancel"}` (owner, >24h before start), `{"action":"reschedule","startsAt"}` (same rules + availability), `{"action":"complete"}` / `{"action":"no-show"}` (treating doctor, after start). |
| `GET /api/admin/stats` | 🔒 admin | Dashboard metrics: today, 7-day chart, top services, cancellation rate. |
| `GET /api/cron/reminders` | Bearer CRON_SECRET | Send 24h reminders for appointments starting in 23–25h without one yet; marks `reminderSentAt`. |
| `GET /api` | public | Health check. |

## How the slot engine works

All scheduling rules live in **one pure module: [`src/server/services/slots.ts`](src/server/services/slots.ts)** — no database access, no clock reads, no env vars. Everything (working hours, time off, appointments, “now”) is passed in, which is exactly what makes it fully unit-testable.

A candidate slot `[start, start + duration)` is **open** only if **all** of these hold:

1. **Minimum notice** — `start ≥ now + 60 minutes` (bookings need lead time).
2. **Inside working hours** — the slot fits entirely inside ONE weekly window for that weekday (`WorkingHours` stores minutes-since-midnight, e.g. 09:30 = 570, and a doctor may have several windows per day).
3. **No time off** — the slot does not overlap any `TimeOff` interval.
4. **No conflict** — the slot does not overlap any non-cancelled appointment for that doctor.

Two intervals *overlap* iff `a.start < b.end && b.start < a.end` — so back-to-back appointments (one ends exactly when the next starts) are allowed.

`generateSlots()` walks each working window on a 15-minute grid and runs every candidate through `evaluateSlot()`, so **generation and validation can never disagree**. The public `GET /api/slots` endpoint uses this function to render the picker; in *any doctor* mode it merges the availability of every doctor offering the service and each slot lists the free doctor ids.

The **cancellation window rule** lives in the same module: `cancellationWindowViolation(now, startsAt)` returns a clear message when fewer than 24 hours remain, used by both cancel and reschedule (for reschedule it applies to the *original* start time).

## How double-booking is prevented

The same `evaluateSlot()` that powers the slot picker is re-run **inside a database transaction**, immediately before the insert:

```
BEGIN TRANSACTION
  load service + doctor (+ services they offer)        -- 404/400 if invalid
  load working hours / time off / appointments         -- fresh, inside the tx
  evaluateSlot(startsAt)                               -- 409 if just taken,
                                                        -- 400 if outside hours / too soon
  check the patient has no overlapping appointment      -- 409
  INSERT appointment                                   -- commit makes the slot taken
COMMIT
```

- **SQLite (local development):** Prisma serializes interactive transactions, so the check-then-insert sequence is atomic.
- **PostgreSQL (Neon / production):** the booking transaction runs with isolation level **SERIALIZABLE**. If two customers confirm the same slot at the same millisecond, Postgres aborts one of the transactions (Prisma error `P2034`), and the centralized error handler converts it into **HTTP 409 — “That slot was just taken. Please choose another time.”** The client then refreshes the slot grid automatically.

Rescheduling goes through the same transactional check at the new time (with the appointment being moved excluded from the busy list), plus the 24-hour change window on the original start.

## Timezone handling

- **Everything is stored as UTC** (`DateTime` columns; `startsAt`/`endsAt` are instants).
- **All wall-clock math** (working hours, day boundaries, slot labels) happens in `CLINIC_TIMEZONE` through a dependency-free `Intl`-based helper layer ([`src/lib/time.ts`](src/lib/time.ts)) with DST-safe two-pass conversion.
- The API returns ISO UTC strings; the UI formats them in clinic local time (the timezone is injected from the server layout into a React context).

## Testing

```bash
npm test
```

28 Vitest unit tests cover the scheduling core in `src/server/services/slots.test.ts`:

- slot generation inside working hours (grid, window bounds, lunch gap)
- no slots during time off (full-day, partial, and touching boundaries)
- no slots overlapping existing appointments (including back-to-back edges)
- minimum-notice rule (60-minute boundary)
- cancellation-window rule (25h allowed; 24h, 23h and past blocked)
- **double-booking conflict** — the first booking of a slot succeeds, an identical second one is rejected with reason `conflict`
- DST correctness (Europe/Berlin spring-forward day, de-duplicated instants)

## Deploy on Vercel + Neon

### 1. Create the Neon database

1. Sign up at [neon.tech](https://neon.tech) and create a project.
2. Copy the pooled connection string — it looks like
   `postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`.

### 2. Point the schema at PostgreSQL

In `prisma/schema.prisma` change **only** the provider line:

```prisma
datasource db {
  provider = "postgresql"   // was "sqlite"
  url      = env("DATABASE_URL")
}
```

(The schema itself is already portable — plain `String` role/status columns, integer cents for prices, no database-specific types.)

### 3. Push the schema and seed

```bash
# with DATABASE_URL pointing at Neon
npx prisma db push
npm run db:seed      # fast even over the network: createMany batch inserts
```

### 4. Deploy on Vercel

1. Push the repository to GitHub/GitLab and import it into [Vercel](https://vercel.com) (the framework is auto-detected as Next.js).
2. Add the environment variables (Project → Settings → Environment Variables):

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | your Neon connection string (with `?sslmode=require`) |
   | `JWT_SECRET` | random string ≥ 16 chars |
   | `CRON_SECRET` | random string |
   | `CLINIC_TIMEZONE` | e.g. `Africa/Addis_Ababa` |
   | `RESEND_API_KEY` | optional |
   | `EMAIL_FROM` | optional |

3. Deploy. The build runs `prisma generate && next build`.
4. `vercel.json` already registers the daily cron:

   ```json
   { "crons": [{ "path": "/api/cron/reminders", "schedule": "0 8 * * *" }] }
   ```

   Vercel calls `GET /api/cron/reminders` daily at 08:00 UTC with `Authorization: Bearer <CRON_SECRET>` (sent automatically when `CRON_SECRET` is set), which sends 24-hour reminders for appointments starting 23–25 hours later and stamps `reminderSentAt`.

## Project structure

```
├── prisma/
│   ├── schema.prisma          # User, Service, Staff, StaffService, WorkingHours, TimeOff, Appointment
│   └── seed.ts                # fast batched demo seed (relative dates)
├── screenshots/               # README screenshots
├── src/
│   ├── app/
│   │   ├── page.tsx           # public landing page
│   │   ├── login/ register/ account/
│   │   ├── book/              # customer booking wizard
│   │   ├── appointments/      # customer history + cancel/reschedule
│   │   ├── schedule/          # doctor week calendar
│   │   ├── admin/             # dashboard + manage console
│   │   └── api/               # REST layer (thin route files)
│   │       ├── auth/ services/ staff/ slots/ appointments/ admin/ cron/
│   ├── components/            # navbar, footer, providers, guards, shared UI (day strip, slot picker, …)
│   │   ├── ui/                # shadcn/ui primitives
│   │   ├── admin/ booking/    # page-specific components
│   ├── hooks/                 # use-auth (session + role helpers)
│   ├── lib/                   # db client, api client, time helpers, types, constants, formatting
│   └── server/
│       ├── controllers/       # request parsing + validation + role checks
│       ├── services/          # business logic (slots.ts is the pure scheduling core)
│       ├── middleware/        # session + RBAC (re-loads the user from the DB)
│       ├── config.ts errors.ts validation.ts
├── .env.example
├── vercel.json                # daily reminder cron
└── vitest.config.ts
```

## Roadmap

- [ ] Recurring appointments and series booking
- [ ] Patient medical notes / visit summaries per appointment
- [ ] Admin audit log for schedule changes
- [ ] Waitlist: notify patients when an earlier slot opens
- [ ] SMS reminders alongside email (Twilio)
- [ ] iCal export and “add to calendar” links
- [ ] Multi-clinic / multi-location support
- [ ] Stripe deposits for premium services
- [ ] Rate limiting and account lockout on repeated failed logins
- [ ] Doctor self-service working-hours editing (currently admin-managed)

---

Built as a full-stack reference application: clean separation between the REST layer, pure domain logic, and UI — with the scheduling core designed to be read, tested, and extended.
