"use client";

import type { Course } from "@/types";
import { SLOT_HEIGHT } from "@/utils/time";
import CourseBlock from "./CourseBlock";

interface DayColumnProps {
  dayCode: string;
  dayLabel: string;
  courses: { course: Course; uniqueId: string }[];
  gridStartHour: number;
  gridEndHour: number;
  onRemove: (uniqueId: string) => void;
}

export default function DayColumn({ dayCode, dayLabel, courses, gridStartHour, gridEndHour, onRemove }: DayColumnProps) {
  const totalSlots = (gridEndHour - gridStartHour) * 2;
  const totalHeight = totalSlots * SLOT_HEIGHT;

  return (
    <div className="day-column">
      <div className="day-header">{dayLabel}</div>
      <div
        className="day-slots"
        data-day={dayCode}
        style={{
          height: `${totalHeight}px`,
          background: `repeating-linear-gradient(to bottom, transparent, transparent ${SLOT_HEIGHT - 1}px, #f5f0e8 ${SLOT_HEIGHT - 1}px, #f5f0e8 ${SLOT_HEIGHT}px)`,
        }}
      >
        {courses
          .filter((c) => c.course.days.includes(dayCode))
          .map((c) => (
            <CourseBlock
              key={c.uniqueId}
              course={c.course}
              uniqueId={c.uniqueId}
              gridStartHour={gridStartHour}
              onRemove={onRemove}
            />
          ))}
      </div>
    </div>
  );
}
