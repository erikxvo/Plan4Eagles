"use client";

import { generateTimeSlots } from "@/utils/time";

interface TimeColumnProps {
  startHour: number;
  endHour: number;
}

export default function TimeColumn({ startHour, endHour }: TimeColumnProps) {
  const slots = generateTimeSlots(startHour, endHour);

  return (
    <div className="time-column">
      <div className="time-header"></div>
      {slots.map((label, i) => (
        <div key={i} className="time-slot">{label}</div>
      ))}
    </div>
  );
}
