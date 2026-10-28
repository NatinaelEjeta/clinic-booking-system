"use client";

/**
 * Grid of selectable time slots. When `showDoctors` is set (any-doctor
 * browsing), each slot also shows how many doctors are free at that time.
 */

import { Users } from "lucide-react";
import type { SlotDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SlotPickerProps {
  slots: SlotDTO[];
  selectedStartsAt?: string | null;
  onSelect: (slot: SlotDTO) => void;
  showDoctors?: boolean;
  className?: string;
}

export function SlotPicker({
  slots,
  selectedStartsAt,
  onSelect,
  showDoctors = false,
  className,
}: SlotPickerProps) {
  return (
    <div
      className={cn("grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6", className)}
      role="group"
      aria-label="Available times"
    >
      {slots.map((slot) => {
        const isSelected = slot.startsAt === selectedStartsAt;
        const doctorCount = slot.staffIds?.length ?? 0;
        return (
          <button
            key={slot.startsAt}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(slot)}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2.5 text-sm font-medium tabular-nums transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              isSelected
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "bg-card hover:border-primary/60 hover:bg-accent",
            )}
          >
            <span>{slot.startTime}</span>
            {showDoctors && doctorCount > 1 && (
              <span
                className={cn(
                  "flex items-center gap-1 text-[11px] font-normal",
                  isSelected ? "text-primary-foreground/90" : "text-muted-foreground",
                )}
              >
                <Users className="h-3 w-3" aria-hidden />
                {doctorCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
