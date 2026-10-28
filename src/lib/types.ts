/**
 * Shared DTO types returned by the REST API and consumed by the client.
 * This module is types-only so it can safely be imported on the client.
 */

import type { AppointmentStatus, Role } from "./constants";

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Set for STAFF users — the linked doctor profile id. */
  staffId: string | null;
}

export interface ServiceDTO {
  id: string;
  name: string;
  durationMinutes: number;
  /** Decimal currency units (500 = 500 ETB; stored as cents server-side). */
  price: number;
  active: boolean;
}

export interface StaffDTO {
  id: string;
  name: string;
  email: string;
  specialty: string;
  services: Array<Pick<ServiceDTO, "id" | "name" | "durationMinutes" | "price">>;
}

export interface WorkingHoursDTO {
  id: string;
  weekday: number;
  startMinutes: number;
  endMinutes: number;
}

export interface TimeOffDTO {
  id: string;
  /** ISO UTC instant. */
  startsAt: string;
  /** ISO UTC instant. */
  endsAt: string;
  reason: string;
}

export interface SlotDTO {
  /** ISO UTC instant of the slot start. */
  startsAt: string;
  /** ISO UTC instant of the slot end. */
  endsAt: string;
  /** Clinic-local "HH:mm" label, e.g. "09:30". */
  startTime: string;
  /**
   * Only present when the slots were requested for "any doctor":
   * the ids of every doctor who is free at this time.
   */
  staffIds?: string[];
}

export interface SlotsResponse {
  serviceId: string;
  staffId: string | null;
  date: string;
  timezone: string;
  slots: SlotDTO[];
}

export interface AppointmentDTO {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  notes: string;
  reminderSentAt: string | null;
  createdAt: string;
  /** May the current viewer cancel this appointment right now? */
  canCancel: boolean;
  /** May the current viewer reschedule this appointment right now? */
  canReschedule: boolean;
  service: {
    id: string;
    name: string;
    durationMinutes: number;
    price: number;
  };
  staff: {
    id: string;
    name: string;
    specialty: string;
  };
  /** Present for STAFF and ADMIN viewers only. */
  customer?: {
    id: string;
    name: string;
  };
}

export interface AdminStats {
  timezone: string;
  today: string;
  todayCount: number;
  todayAppointments: AppointmentDTO[];
  next7DaysCount: number;
  bookingsPerDay: Array<{
    /** Date key ("YYYY-MM-DD"). */
    date: string;
    /** Display label, e.g. "Thu 30". */
    label: string;
    bookings: number;
  }>;
  topServices: Array<{
    serviceId: string;
    name: string;
    count: number;
  }>;
  totals: {
    total: number;
    booked: number;
    cancelled: number;
    completed: number;
    noShow: number;
  };
  /** Percentage (0-100) of appointments that were cancelled. */
  cancellationRate: number;
}
