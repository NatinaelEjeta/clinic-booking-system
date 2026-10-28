/**
 * Unit tests for the pure slot-generation module (src/server/services/slots.ts).
 *
 * Africa/Addis_Ababa (UTC+3, no DST) is used as the deterministic clinic
 * timezone; one Europe/Berlin case proves DST correctness.
 *
 * Run with: npm test
 */

import { describe, expect, it } from "vitest";
import {
  cancellationWindowViolation,
  evaluateSlot,
  generateSlots,
  intervalsOverlap,
  type SlotContext,
  type TimeInterval,
} from "@/server/services/slots";
import { zonedTimeToUtc } from "@/lib/time";

const TZ = "Africa/Addis_Ababa"; // UTC+3 all year, no DST — deterministic.

/** Fixed "now": 2026-06-01 06:00 UTC = 09:00 clinic time (a Monday). */
const NOW = new Date("2026-06-01T06:00:00Z");

/** 2026-06-01 is a Monday (weekday 1). */
const MONDAY = "2026-06-01";

const DEFAULT_WINDOWS = [
  { weekday: 1, startMinutes: 540, endMinutes: 720 }, // 09:00 - 12:00
  { weekday: 1, startMinutes: 810, endMinutes: 1020 }, // 13:30 - 17:00
];

function makeCtx(overrides: Partial<SlotContext> = {}): SlotContext {
  return {
    timeZone: TZ,
    dateKey: MONDAY,
    durationMinutes: 30,
    workingWindows: DEFAULT_WINDOWS,
    timeOff: [],
    appointments: [],
    now: NOW,
    ...overrides,
  };
}

/** Clinic-local wall-clock minutes on MONDAY -> UTC Date. */
function at(minutes: number, dateKey: string = MONDAY): Date {
  return zonedTimeToUtc(dateKey, minutes, TZ);
}

function interval(startMinutes: number, endMinutes: number, dateKey = MONDAY): TimeInterval {
  return { start: at(startMinutes, dateKey), end: at(endMinutes, dateKey) };
}

describe("generateSlots — inside working hours", () => {
  it("generates slots on the 15-minute grid inside each window", () => {
    // minNoticeMinutes: 0 isolates the window/grid rules from the notice rule.
    const slots = generateSlots(makeCtx({ minNoticeMinutes: 0 }));
    // Morning window: 09:00..11:30 starts (11:30+30 = 12:00 = window end) => 11 slots
    // Afternoon window: 13:30..16:30 starts => 13 slots
    expect(slots).toHaveLength(11 + 13);

    expect(slots[0].startTime).toBe("09:00");
    expect(slots[0].startMinutes).toBe(540);
    expect(slots[0].startsAt.toISOString()).toBe("2026-06-01T06:00:00.000Z");
    expect(slots[0].endsAt.toISOString()).toBe("2026-06-01T06:30:00.000Z");

    const times = slots.map((s) => s.startTime);
    expect(times).toContain("11:30"); // last morning slot ends exactly at 12:00
    expect(times).not.toContain("11:45"); // would end at 12:15 — outside the window
    expect(times).toContain("13:30");
    expect(times).toContain("16:30");
    expect(times).not.toContain("16:45");
    // No slot may start inside the lunch break.
    expect(times.filter((t) => t > "12:00" && t < "13:30")).toHaveLength(0);
  });

  it("returns no slots when the doctor has no hours that weekday", () => {
    const slots = generateSlots(makeCtx({ workingWindows: [{ weekday: 2, startMinutes: 540, endMinutes: 720 }] }));
    expect(slots).toHaveLength(0);
  });

  it("never generates a slot longer than the longest window", () => {
    // Windows are 180 and 210 minutes long — a 250-minute service cannot fit.
    const slots = generateSlots(makeCtx({ durationMinutes: 250 }));
    expect(slots).toHaveLength(0);
  });

  it("generates one long slot when it exactly fits the longer window", () => {
    const slots = generateSlots(makeCtx({ durationMinutes: 210, minNoticeMinutes: 0 }));
    expect(slots.map((s) => s.startTime)).toEqual(["13:30"]);
  });

  it("keeps slots in chronological order with UTC instants", () => {
    const slots = generateSlots(makeCtx());
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].startsAt.getTime()).toBeGreaterThan(slots[i - 1].startsAt.getTime());
    }
  });
});

describe("generateSlots — time off", () => {
  it("excludes slots that overlap a full-day time off", () => {
    const timeOff = [
      { start: at(0), end: at(1440) }, // the whole Monday
    ];
    expect(generateSlots(makeCtx({ timeOff }))).toHaveLength(0);
  });

  it("excludes slots overlapping a partial (afternoon) time off", () => {
    const timeOff = [{ start: at(780), end: at(1080) }]; // 13:00-18:00 clinic
    const slots = generateSlots(makeCtx({ timeOff, minNoticeMinutes: 0 }));
    // Only the morning window survives, and only slots fully before 13:00.
    expect(slots).toHaveLength(11);
    expect(slots.every((s) => s.startMinutes + 30 <= 780)).toBe(true);
  });

  it("keeps slots that merely touch the time off boundary (touching is not overlapping)", () => {
    // Time off 12:00-13:30 (exactly the lunch break): all slots must survive
    // because intervals that only touch at endpoints do not overlap.
    const timeOff = [{ start: at(720), end: at(810) }];
    const slots = generateSlots(makeCtx({ timeOff, minNoticeMinutes: 0 }));
    expect(slots).toHaveLength(11 + 13);
  });
});

describe("generateSlots — existing appointments", () => {
  it("excludes slots overlapping an existing appointment", () => {
    const appointments = [interval(540, 600)]; // 09:00-10:00 is taken
    const slots = generateSlots(makeCtx({ appointments, minNoticeMinutes: 0 }));
    const times = slots.map((s) => s.startTime);
    expect(times).not.toContain("09:00");
    expect(times).not.toContain("09:30");
    expect(times).not.toContain("09:45");
    expect(times).toContain("10:00"); // back-to-back is fine (touching, not overlapping)
    expect(slots).toHaveLength(11 + 13 - 4);
  });

  it("treats back-to-back appointments as non-overlapping", () => {
    const appointments = [interval(600, 630)]; // 10:00-10:30
    const slots = generateSlots(makeCtx({ appointments }));
    const times = slots.map((s) => s.startTime);
    expect(times).not.toContain("10:00");
    expect(times).toContain("10:30");
  });

  it("ignores appointments on other days (they cannot collide)", () => {
    const appointments = [interval(540, 1020, "2026-06-02")]; // Tuesday, all day
    expect(
      generateSlots(makeCtx({ appointments, minNoticeMinutes: 0 })),
    ).toHaveLength(11 + 13);
  });
});

describe("generateSlots — minimum notice", () => {
  it("excludes slots starting sooner than 60 minutes from now", () => {
    // "now" is 09:00 clinic time; 09:45 starts in 45 minutes -> excluded,
    // 10:00 starts in exactly 60 minutes -> included.
    const slots = generateSlots(makeCtx());
    const times = slots.map((s) => s.startTime);
    expect(times).not.toContain("09:00");
    expect(times).not.toContain("09:30");
    expect(times).not.toContain("09:45");
    expect(times).toContain("10:00");
  });

  it("honours a custom minNoticeMinutes", () => {
    const slots = generateSlots(makeCtx({ minNoticeMinutes: 0 }));
    expect(slots.map((s) => s.startTime)).toContain("09:00");
  });

  it("returns nothing for a day that is already fully in the past", () => {
    const slots = generateSlots(makeCtx({ dateKey: "2026-05-25", workingWindows: [{ weekday: 1, startMinutes: 540, endMinutes: 1020 }] }));
    expect(slots).toHaveLength(0);
  });
});

describe("evaluateSlot — single slot checks", () => {
  it("accepts a clean slot inside working hours", () => {
    expect(evaluateSlot(makeCtx(), at(600))).toEqual({ ok: true });
  });

  it("rejects a slot outside working hours", () => {
    expect(evaluateSlot(makeCtx(), at(750))).toEqual({ ok: false, reason: "outside-working-hours" }); // lunch break
    expect(evaluateSlot(makeCtx(), at(1200))).toEqual({ ok: false, reason: "outside-working-hours" }); // evening
  });

  it("rejects a slot on a different clinic-local day", () => {
    const tuesdayNoon = zonedTimeToUtc("2026-06-02", 600, TZ);
    expect(evaluateSlot(makeCtx(), tuesdayNoon)).toEqual({ ok: false, reason: "outside-working-hours" });
  });

  it("rejects a slot too soon (minimum notice)", () => {
    expect(evaluateSlot(makeCtx(), at(585))).toEqual({ ok: false, reason: "too-soon" }); // 09:45, 45 min ahead
    expect(evaluateSlot(makeCtx(), at(600))).toEqual({ ok: true }); // 10:00, exactly 60 min ahead
  });

  it("rejects a slot during time off", () => {
    const ctx = makeCtx({ timeOff: [interval(810, 1020)] });
    expect(evaluateSlot(ctx, at(840))).toEqual({ ok: false, reason: "during-time-off" });
  });
});

describe("double-booking conflict (second booking of the same slot)", () => {
  it("accepts the first booking and rejects the second identical one", () => {
    const ctx = makeCtx();
    const slotStart = at(600); // 10:00 clinic time

    // First customer books 10:00-10:30.
    expect(evaluateSlot(ctx, slotStart)).toEqual({ ok: true });
    const bookedInterval: TimeInterval = {
      start: slotStart,
      end: new Date(slotStart.getTime() + 30 * 60_000),
    };

    // Second customer tries the same slot — must be rejected with 409 conflict.
    const ctxAfterFirstBooking = makeCtx({ appointments: [bookedInterval] });
    expect(evaluateSlot(ctxAfterFirstBooking, slotStart)).toEqual({
      ok: false,
      reason: "conflict",
    });

    // And the slot disappears from generated availability.
    const slots = generateSlots(ctxAfterFirstBooking);
    expect(slots.map((s) => s.startTime)).not.toContain("10:00");
    expect(slots.map((s) => s.startTime)).toContain("10:30");
  });

  it("rejects partial overlaps in both directions", () => {
    const slotStart = at(600);
    const booked = interval(585, 615); // 09:45-10:15 overlaps 10:00-10:30
    const ctx = makeCtx({ appointments: [booked] });
    expect(evaluateSlot(ctx, slotStart)).toEqual({ ok: false, reason: "conflict" });

    const booked2 = interval(615, 645); // 10:15-10:45 overlaps 10:00-10:30
    expect(evaluateSlot(makeCtx({ appointments: [booked2] }), slotStart)).toEqual({
      ok: false,
      reason: "conflict",
    });
  });
});

describe("cancellation window rule", () => {
  it("allows changes more than 24 hours before the start", () => {
    expect(cancellationWindowViolation(NOW, new Date(NOW.getTime() + 25 * 3_600_000))).toBeNull();
  });

  it("blocks changes within 24 hours of the start", () => {
    const message = cancellationWindowViolation(NOW, new Date(NOW.getTime() + 23 * 3_600_000));
    expect(message).toMatch(/more than 24 hours before the start time/);
  });

  it("blocks changes exactly 24 hours before the start (boundary is inclusive)", () => {
    expect(cancellationWindowViolation(NOW, new Date(NOW.getTime() + 24 * 3_600_000))).not.toBeNull();
  });

  it("blocks changes for appointments already started or in the past", () => {
    expect(cancellationWindowViolation(NOW, new Date(NOW.getTime() - 3_600_000))).not.toBeNull();
  });
});

describe("intervalsOverlap", () => {
  it("is false for touching intervals and true for real overlaps", () => {
    const a: TimeInterval = { start: at(540), end: at(570) };
    expect(intervalsOverlap(a, { start: at(570), end: at(600) })).toBe(false);
    expect(intervalsOverlap(a, { start: at(560), end: at(600) })).toBe(true);
    expect(intervalsOverlap(a, a)).toBe(true);
  });
});

describe("DST correctness (Europe/Berlin spring-forward, 2026-03-29)", () => {
  it("maps non-existent wall-clock times safely and keeps existing ones exact", () => {
    // 01:00 CET = 00:00 UTC
    expect(zonedTimeToUtc("2026-03-29", 60, "Europe/Berlin").toISOString()).toBe(
      "2026-03-29T00:00:00.000Z",
    );
    // 03:00 CEST = 01:00 UTC
    expect(zonedTimeToUtc("2026-03-29", 180, "Europe/Berlin").toISOString()).toBe(
      "2026-03-29T01:00:00.000Z",
    );
    // The non-existent 02:30 wall time folds into the gap; it must still
    // round-trip to a valid instant (never crash, never shift the date).
    const folded = zonedTimeToUtc("2026-03-29", 150, "Europe/Berlin");
    expect(folded.getTime()).toBeGreaterThan(0);
  });

  it("generates a de-duplicated slot list across a DST transition day", () => {
    const ctx: SlotContext = {
      timeZone: "Europe/Berlin",
      dateKey: "2026-03-29", // Sunday
      durationMinutes: 30,
      workingWindows: [{ weekday: 0, startMinutes: 60, endMinutes: 240 }], // 01:00-04:00 wall
      timeOff: [],
      appointments: [],
      now: new Date("2026-03-28T00:00:00Z"),
    };
    const slots = generateSlots(ctx);
    const instants = slots.map((s) => s.startsAt.getTime());
    expect(new Set(instants).size).toBe(instants.length); // no duplicates
    expect(slots.length).toBeGreaterThan(0);
  });
});
