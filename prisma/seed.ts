/**
 * CarePoint Clinic — database seed.
 *
 * Design goals:
 *   * FAST over a remote database: every table is inserted with `createMany`
 *     in small batches (no per-row round trips). Passwords are hashed only
 *     once per distinct demo password.
 *   * Never stale: all dates are computed relative to "today" in the clinic
 *     timezone, so the demo always has a realistic past and future.
 *   * Deterministic: a fixed-seed LCG is used instead of Math.random(), so
 *     repeated runs produce the same data.
 *
 * Run with: npm run db:seed   (or: npx tsx prisma/seed.ts)
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  DEFAULT_CLINIC_TIMEZONE,
  SLOT_STEP_MINUTES,
} from "../src/lib/constants";
import {
  addDaysToKey,
  isValidTimeZone,
  todayKey,
  weekdayOfDateKey,
  zonedTimeToUtc,
} from "../src/lib/time";

const prisma = new PrismaClient();

const timeZone = (() => {
  const tz = process.env.CLINIC_TIMEZONE || DEFAULT_CLINIC_TIMEZONE;
  return isValidTimeZone(tz) ? tz : DEFAULT_CLINIC_TIMEZONE;
})();

/* ---------------------------------------------------------------------------
 * Deterministic pseudo-random generator (fixed seed)
 * ------------------------------------------------------------------------- */

let lcgState = 987654321;
function rnd(): number {
  lcgState = (lcgState * 1664525 + 1013904223) % 4294967296;
  return lcgState / 4294967296;
}

/* ---------------------------------------------------------------------------
 * Static demo data (ids are fixed so relations can be wired without reads)
 * ------------------------------------------------------------------------- */

const PASSWORDS = {
  admin: "Admin123!",
  doctor: "Doctor123!",
  patient: "Patient123!",
};

const SERVICES = [
  { key: "svc1", name: "General Consultation", durationMinutes: 30, priceCents: 50000 },
  { key: "svc2", name: "Dental Check-up", durationMinutes: 45, priceCents: 80000 },
  { key: "svc3", name: "Pediatric Visit", durationMinutes: 30, priceCents: 60000 },
  { key: "svc4", name: "Eye Exam", durationMinutes: 40, priceCents: 70000 },
  { key: "svc5", name: "Lab Review", durationMinutes: 20, priceCents: 40000 },
  { key: "svc6", name: "Follow-up", durationMinutes: 15, priceCents: 30000 },
];

/** Weekly working template. weekday: 0 = Sunday … 6 = Saturday. Minutes since midnight. */
interface DoctorSeed {
  key: string;
  userId: string;
  name: string;
  email: string;
  specialty: string;
  serviceIdx: number[];
  hours: Record<number, Array<[number, number]>>;
}

const DOCTORS: DoctorSeed[] = [
  {
    key: "stf1",
    userId: "usr_doc1",
    name: "Dr. Sara Tesfaye",
    email: "doctor@clinic.demo",
    specialty: "General Medicine",
    serviceIdx: [0, 3, 4, 5],
    hours: {
      1: [[540, 720], [810, 1020]], // Mon 09:00-12:00, 13:30-17:00
      2: [[540, 720], [810, 1020]],
      3: [[540, 720], [810, 1020]],
      4: [[540, 720], [810, 1020]],
      5: [[540, 720], [810, 1020]],
    },
  },
  {
    key: "stf2",
    userId: "usr_doc2",
    name: "Dr. Daniel Alemu",
    email: "daniel@clinic.demo",
    specialty: "Dentistry",
    serviceIdx: [1, 0, 5],
    hours: {
      1: [[510, 750], [840, 1080]], // Mon 08:30-12:30, 14:00-18:00
      2: [[510, 750], [840, 1080]],
      3: [[510, 750], [840, 1080]],
      4: [[510, 750], [840, 1080]],
      5: [[510, 750], [840, 1080]],
      6: [[540, 720]], // Sat 09:00-12:00
    },
  },
  {
    key: "stf3",
    userId: "usr_doc3",
    name: "Dr. Lidiya Bekele",
    email: "lidiya@clinic.demo",
    specialty: "Pediatrics",
    serviceIdx: [2, 0, 3, 5],
    hours: {
      2: [[600, 780], [840, 960]], // Tue 10:00-13:00, 14:00-16:00
      3: [[600, 780], [840, 960]],
      4: [[600, 780], [840, 960]],
      5: [[600, 780], [840, 960]],
      6: [[600, 780], [840, 960]],
    },
  },
];

const CUSTOMERS = [
  { key: "usr_c1", name: "Kebede Tolosa", email: "patient@clinic.demo" },
  { key: "usr_c2", name: "Hanna Girma", email: "hanna.girma@example.com" },
  { key: "usr_c3", name: "Yonas Bekele", email: "yonas.bekele@example.com" },
  { key: "usr_c4", name: "Selam Awol", email: "selam.awol@example.com" },
  { key: "usr_c5", name: "Dereje Mekonnen", email: "dereje.mekonnen@example.com" },
  { key: "usr_c6", name: "Marta Assefa", email: "marta.assefa@example.com" },
  { key: "usr_c7", name: "Tewodros Haile", email: "tewodros.haile@example.com" },
  { key: "usr_c8", name: "Rahel Abera", email: "rahel.abera@example.com" },
  { key: "usr_c9", name: "Samuel Getachew", email: "samuel.getachew@example.com" },
  { key: "usr_c10", name: "Bethlehem Tesfaye", email: "bethlehem.tesfaye@example.com" },
];

const NOTE_POOL = [
  "First visit.",
  "Bringing previous lab results.",
  "Follow-up on last prescription.",
  "Mild symptoms for a few days.",
  "Insurance claim form needed.",
  "",
  "",
  "",
];

/* ---------------------------------------------------------------------------
 * Batch insert helper
 * ------------------------------------------------------------------------- */

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/* ---------------------------------------------------------------------------
 * Seed
 * ------------------------------------------------------------------------- */

async function main() {
  const today = todayKey(timeZone);
  const now = new Date();

  console.log(`Seeding clinic data (timezone: ${timeZone}, today: ${today}) …`);

  // 1. Clear existing rows (FK-safe order). Cheap even over a remote DB.
  await prisma.appointment.deleteMany();
  await prisma.timeOff.deleteMany();
  await prisma.workingHours.deleteMany();
  await prisma.staffService.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.service.deleteMany();
  await prisma.user.deleteMany();

  // 2. Hash each distinct demo password exactly once (fast).
  const adminHash = bcrypt.hashSync(PASSWORDS.admin, 10);
  const doctorHash = bcrypt.hashSync(PASSWORDS.doctor, 10);
  const patientHash = bcrypt.hashSync(PASSWORDS.patient, 10);

  // 3. Users (admin + 3 doctors + 10 customers) in one batched createMany.
  const users = [
    {
      id: "usr_admin",
      name: "Amina Solomon",
      email: "admin@clinic.demo",
      passwordHash: adminHash,
      role: "ADMIN",
    },
    ...DOCTORS.map((d) => ({
      id: d.userId,
      name: d.name,
      email: d.email,
      passwordHash: doctorHash,
      role: "STAFF",
    })),
    ...CUSTOMERS.map((c) => ({
      id: c.key,
      name: c.name,
      email: c.email,
      passwordHash: patientHash,
      role: "CUSTOMER",
    })),
  ];
  for (const part of chunk(users, 50)) await prisma.user.createMany({ data: part });

  // 4. Services.
  const services = SERVICES.map((s) => ({
    id: s.key,
    name: s.name,
    durationMinutes: s.durationMinutes,
    priceCents: s.priceCents,
    active: true,
  }));
  await prisma.service.createMany({ data: services });

  // 5. Staff profiles + staff-service links + weekly working hours.
  await prisma.staff.createMany({
    data: DOCTORS.map((d) => ({
      id: d.key,
      userId: d.userId,
      specialty: d.specialty,
    })),
  });

  const staffServices = DOCTORS.flatMap((d) =>
    d.serviceIdx.map((i) => ({ staffId: d.key, serviceId: SERVICES[i].key })),
  );
  await prisma.staffService.createMany({ data: staffServices });

  const workingHours = DOCTORS.flatMap((d) =>
    Object.entries(d.hours).flatMap(([weekday, windows]) =>
      windows.map(([startMinutes, endMinutes]) => ({
        staffId: d.key,
        weekday: Number(weekday),
        startMinutes,
        endMinutes,
      })),
    ),
  );
  await prisma.workingHours.createMany({ data: workingHours });

  // 6. Time off — relative to today so the demo never goes stale.
  const nextWednesday = (() => {
    const wd = weekdayOfDateKey(today);
    const delta = ((3 - wd + 7) % 7) || 7; // next Wednesday (strictly future)
    return addDaysToKey(today, delta);
  })();
  const timeOff = [
    {
      id: "toff1",
      staffId: "stf1",
      startsAt: zonedTimeToUtc(nextWednesday, 0, timeZone),
      endsAt: zonedTimeToUtc(addDaysToKey(nextWednesday, 1), 0, timeZone),
      reason: "Medical conference",
    },
    {
      id: "toff2",
      staffId: "stf2",
      startsAt: zonedTimeToUtc(addDaysToKey(today, -3), 0, timeZone),
      endsAt: zonedTimeToUtc(addDaysToKey(today, -2), 0, timeZone),
      reason: "Sick leave",
    },
    {
      id: "toff3",
      staffId: "stf3",
      startsAt: zonedTimeToUtc(addDaysToKey(today, 2), 720, timeZone),
      endsAt: zonedTimeToUtc(addDaysToKey(today, 2), 1020, timeZone),
      reason: "Personal leave",
    },
  ];
  await prisma.timeOff.createMany({ data: timeOff });

  // 7. Appointments across the past 2 weeks and the next 2 weeks.
  interface Interval {
    start: Date;
    end: Date;
  }
  const overlaps = (a: Interval, b: Interval) =>
    a.start < b.end && b.start < a.end;

  const appointmentRows: Array<{
    id: string;
    customerId: string;
    staffId: string;
    serviceId: string;
    startsAt: Date;
    endsAt: Date;
    status: string;
    notes: string;
    reminderSentAt: Date | null;
    createdAt: Date;
  }> = [];

  /** doctor intervals already used, per date key */
  const usedByDoctor = new Map<string, Interval[]>();
  /** customer intervals already used, per date key */
  const usedByCustomer = new Map<string, Interval[]>();

  function markUsed(map: Map<string, Interval[]>, key: string, interval: Interval) {
    const list = map.get(key) ?? [];
    list.push(interval);
    map.set(key, list);
  }

  /** Try to place one appointment for a doctor on a given day. */
  function tryPlace(dayKey: string, doctor: DoctorSeed): boolean {
    const weekday = weekdayOfDateKey(dayKey);
    const windows = doctor.hours[weekday];
    if (!windows || windows.length === 0) return false;

    const svc = SERVICES[doctor.serviceIdx[Math.floor(rnd() * doctor.serviceIdx.length)]];
    const used = usedByDoctor.get(`${dayKey}|${doctor.key}`) ?? [];
    const doctorTimeOff = timeOff
      .filter((t) => t.staffId === doctor.key)
      .map((t) => ({ start: t.startsAt, end: t.endsAt }));

    for (let attempt = 0; attempt < 4; attempt++) {
      const [winStart, winEnd] = windows[Math.floor(rnd() * windows.length)];
      const maxStart = winEnd - svc.durationMinutes;
      if (maxStart < winStart) continue;
      const steps = Math.floor((maxStart - winStart) / SLOT_STEP_MINUTES) + 1;
      const startMinutes = winStart + Math.floor(rnd() * steps) * SLOT_STEP_MINUTES;

      const startsAt = zonedTimeToUtc(dayKey, startMinutes, timeZone);
      const endsAt = new Date(startsAt.getTime() + svc.durationMinutes * 60_000);
      const interval = { start: startsAt, end: endsAt };

      // Must not overlap the doctor's other appointments or time off.
      if (used.some((u) => overlaps(u, interval))) continue;
      if (doctorTimeOff.some((t) => overlaps(t, interval))) continue;

      // The patient must not have two overlapping appointments either.
      const customer = CUSTOMERS[Math.floor(rnd() * CUSTOMERS.length)];
      const custUsed = usedByCustomer.get(`${dayKey}|${customer.key}`) ?? [];
      if (custUsed.some((u) => overlaps(u, interval))) continue;

      const isPast = startsAt.getTime() < now.getTime();
      const roll = rnd();
      let status: string;
      if (isPast) {
        status = roll < 0.7 ? "COMPLETED" : roll < 0.85 ? "NO_SHOW" : "CANCELLED";
      } else {
        status = roll < 0.82 ? "BOOKED" : "CANCELLED";
      }

      appointmentRows.push({
        id: `apt_${appointmentRows.length + 1}`,
        customerId: customer.key,
        staffId: doctor.key,
        serviceId: svc.key,
        startsAt,
        endsAt,
        status,
        notes: NOTE_POOL[Math.floor(rnd() * NOTE_POOL.length)],
        // Reminders were already "sent" for appointments that ran their course.
        reminderSentAt:
          status === "COMPLETED" || status === "NO_SHOW"
            ? new Date(startsAt.getTime() - 24 * 3_600_000)
            : null,
        createdAt: new Date(
          startsAt.getTime() - (2 + Math.floor(rnd() * 5)) * 86_400_000,
        ),
      });

      markUsed(usedByDoctor, `${dayKey}|${doctor.key}`, interval);
      markUsed(usedByCustomer, `${dayKey}|${customer.key}`, interval);
      return true;
    }
    return false;
  }

  const TARGET = 44;
  for (let offset = -14; offset <= 14 && appointmentRows.length < TARGET; offset++) {
    const dayKey = addDaysToKey(today, offset);
    for (const doctor of DOCTORS) {
      if (appointmentRows.length >= TARGET) break;
      // Guarantee the demo doctor has work today and tomorrow for the calendar.
      const isDemoDoctorDay =
        doctor.key === "stf1" && (offset === 0 || offset === 1);
      if (!isDemoDoctorDay && rnd() > 0.42) continue; // ~40% of doctor-days
      const count = rnd() < 0.55 ? 2 : 1;
      for (let i = 0; i < count; i++) tryPlace(dayKey, doctor);
    }
  }

  // Guarantee the demo patient has at least two upcoming appointments.
  let demoPatientCount = appointmentRows.filter((a) => a.customerId === "usr_c1" && a.status === "BOOKED").length;
  for (let offset = 1; offset <= 6 && demoPatientCount < 2; offset++) {
    const dayKey = addDaysToKey(today, offset);
    const before = appointmentRows.length;
    // Force placement: temporarily bias the customer pick.
    const placed = tryPlaceFor(dayKey, DOCTORS[0], "usr_c1");
    if (placed) demoPatientCount++;
    void before;
  }

  function tryPlaceFor(dayKey: string, doctor: DoctorSeed, customerId: string): boolean {
    // Same as tryPlace but with a forced customer (refactored via closure reuse).
    const weekday = weekdayOfDateKey(dayKey);
    const windows = doctor.hours[weekday];
    if (!windows || windows.length === 0) return false;
    const svc = SERVICES[doctor.serviceIdx[0]];
    const used = usedByDoctor.get(`${dayKey}|${doctor.key}`) ?? [];
    const doctorTimeOff = timeOff
      .filter((t) => t.staffId === doctor.key)
      .map((t) => ({ start: t.startsAt, end: t.endsAt }));
    const custUsed = usedByCustomer.get(`${dayKey}|${customerId}`) ?? [];

    for (let startMinutes = windows[0][0]; startMinutes + svc.durationMinutes <= windows[0][1]; startMinutes += SLOT_STEP_MINUTES) {
      const startsAt = zonedTimeToUtc(dayKey, startMinutes, timeZone);
      const endsAt = new Date(startsAt.getTime() + svc.durationMinutes * 60_000);
      const interval = { start: startsAt, end: endsAt };
      if (used.some((u) => overlaps(u, interval))) continue;
      if (doctorTimeOff.some((t) => overlaps(t, interval))) continue;
      if (custUsed.some((u) => overlaps(u, interval))) continue;

      appointmentRows.push({
        id: `apt_${appointmentRows.length + 1}`,
        customerId,
        staffId: doctor.key,
        serviceId: svc.key,
        startsAt,
        endsAt,
        status: "BOOKED",
        notes: "Demo patient appointment.",
        reminderSentAt: null,
        createdAt: new Date(now.getTime() - 86_400_000),
      });
      markUsed(usedByDoctor, `${dayKey}|${doctor.key}`, interval);
      markUsed(usedByCustomer, `${dayKey}|${customerId}`, interval);
      return true;
    }
    return false;
  }

  for (const part of chunk(appointmentRows, 50)) {
    await prisma.appointment.createMany({ data: part });
  }

  // 8. Summary.
  const byStatus = appointmentRows.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log("Seed complete:");
  console.log(`  users:        ${users.length} (1 admin, ${DOCTORS.length} doctors, ${CUSTOMERS.length} customers)`);
  console.log(`  services:     ${services.length}`);
  console.log(`  workingHours: ${workingHours.length} windows`);
  console.log(`  timeOff:      ${timeOff.length}`);
  console.log(`  appointments: ${appointmentRows.length} ${JSON.stringify(byStatus)}`);
  console.log("");
  console.log("Demo accounts (use the quick-fill buttons on the login page):");
  console.log("  admin@clinic.demo   / Admin123!");
  console.log("  doctor@clinic.demo  / Doctor123!");
  console.log("  patient@clinic.demo / Patient123!");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
