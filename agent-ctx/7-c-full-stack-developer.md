# Task 7-c — Admin manage console (/admin/manage)

Agent: full-stack-developer (subagent C)

## Scope
Created the ADMIN-only management console with four tabs (Services | Doctors |
Hours & time off | All appointments). No existing files were modified.

## Files created
- `src/app/admin/manage/page.tsx` — page shell: RequireRole(["ADMIN"]), header
  (“Manage clinic” + Back to dashboard link), shadcn Tabs (grid 2 cols mobile /
  4 cols ≥ sm), one TabsContent per tab component.
- `src/components/admin/services-tab.tsx` — services table (Name, Duration,
  Price, inline Active Switch → PATCH, Edit), create/edit `ServiceDialog`
  (name, duration 5–480, price ETB, active switch), skeleton/error/empty states.
- `src/components/admin/doctors-tab.tsx` — doctor cards (avatar initials, name,
  email, specialty, service badges), `DoctorDialog` (create: name/email/password
  + service Checklist in ScrollArea max-h-48; edit: name/specialty/services,
  email shown read-only), “accounts are never deleted” note.
- `src/components/admin/hours-tab.tsx` — doctor Select (default = first doctor,
  derived at render: `selectedDoctorId ?? staff[0]?.id ?? null`), `HoursEditor`
  (mounted with `key={staffId}`, 7 day rows, open Switch, 1–3 windows of two
  `<Input type="time">` + remove, per-day inline validation: missing times /
  end-after-start / overlap → Save disabled), PUT replaces whole week;
  `TimeOffSection` (datetime-local → `zonedTimeToUtc(...).toISOString()`,
  clinic-tz label, reason, list sorted by startsAt asc with past entries muted,
  destructive Remove → DELETE /api/time-off/{id}).
- `src/components/admin/appointments-tab.tsx` — status Select + clinic-local
  date Input (server-side filters) + client-side search (patient/doctor/service),
  table (Date & time in clinic tz, Patient, Doctor, Service, StatusBadge, Notes
  truncated), `max-h-[520px] overflow-y-auto` container, 100-row cap note.
- `src/components/admin/table-skeleton.tsx` — shared TableSkeleton.

## Key decisions
- Zero `useEffect` anywhere: dialogs/editors are conditionally rendered and
  initialized with `useState(() => initial ?? …)` (avoids the
  `react-hooks/set-state-in-effect` lint failure). Radix Dialog is rendered with
  `open` + `onOpenChange(false) → onClose()` (parent unmounts).
- Query keys: `["services","all"]`, `["staff"]`, `["working-hours",staffId]`,
  `["time-off",staffId]`, `["appointments","admin",status,date||"all"]` — all
  invalidations scoped to the same keys.
- Server Zod/409 messages surfaced via `toast.error(err.message)`; optimistic
  toggle is “keep simple”: invalidate on success, invalidate+toast on error.
- ScrollArea max-height applied to the viewport via
  `[&>[data-radix-scroll-area-viewport]]:max-h-48` (root `max-h` alone does not
  constrain the Radix viewport).
- Teal/semantic tokens only (no blue/indigo), ’ apostrophes, aria labels on all
  icon-only buttons, decorative icons `aria-hidden`.

## Verification performed (agent-browser, isolated session)
- curl `/admin/manage` → 200; `bun run lint` → exit 0; tsc clean for these
  files (only pre-existing errors in `src/server/services/appointments.service.ts`
  remain — not mine).
- Logged in as admin@clinic.demo; all four tabs render with seeded data.
- Services: created service (POST 200 + toast), toggled inactive (PATCH 200),
  edit dialog prefilled correctly. QA row deleted afterwards via Prisma.
- Doctors: create dialog fields + service checkbox checklist verified.
- Hours: invalid window (13:00→12:30) shows inline error + disables Save;
  restored + saved (PUT 200, toast “Working hours saved”).
- Time off: added tomorrow 09:00–10:30 (POST 200, entry listed), removed it
  (DELETE 200) — full CRUD round-trip with cleanup.
- Appointments: search “sara” narrowed rows; status=Cancelled + Reset verified
  (46 → 15 → 1 → 46 rows); no console/page errors.
