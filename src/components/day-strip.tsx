"use client";

/**
 * Horizontal strip of clinic-local date pills ("Wed 12") used by the booking
 * flow, the reschedule dialog and the doctor week calendar. Pass any list of
 * date keys; optional counts render as a small badge (e.g. appointments/day).
 */

import { formatDayLabel } from "@/lib/time";
import { cn } from "@/lib/utils";

interface DayStripProps {
  days: string[];
  selected: string | null;
  onSelect: (dateKey: string) => void;
  /** Optional per-day counts shown under the date. */
  countBy?: Record<string, number>;
  countLabel?: string;
  todayKey?: string;
  className?: string;
}

export function DayStrip({
  days,
  selected,
  onSelect,
  countBy,
  countLabel = "appts",
  todayKey,
  className,
}: DayStripProps) {
  return (
    <div
      className={cn("flex gap-2 overflow-x-auto pb-2", className)}
      role="tablist"
      aria-label="Choose a day"
    >
      {days.map((day) => {
        const isSelected = day === selected;
        const count = countBy?.[day];
        const isToday = day === todayKey;
        return (
          <button
            key={day}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onSelect(day)}
            className={cn(
              "flex min-w-[72px] shrink-0 flex-col items-center gap-0.5 rounded-xl border px-3 py-2 text-sm transition-colors",
              "hover:border-primary/60 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              isSelected
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "bg-card text-foreground",
            )}
          >
            <span className={cn("font-medium", !isSelected && "text-muted-foreground")}>
              {formatDayLabel(day)}
            </span>
            {isToday && (
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wide",
                  isSelected ? "text-primary-foreground/90" : "text-primary",
                )}
              >
                Today
              </span>
            )}
            {countBy && (
              <span
                className={cn(
                  "text-[11px]",
                  isSelected ? "text-primary-foreground/90" : "text-muted-foreground",
                )}
              >
                {count && count > 0 ? `${count} ${countLabel}` : "—"}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
