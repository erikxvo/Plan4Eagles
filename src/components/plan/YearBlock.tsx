"use client";

import { usePlanStore } from "@/store/planStore";
import { calculateSemesterCredits } from "@/utils/gpa";
import SemesterTable from "./SemesterTable";

interface YearBlockProps {
  yearLabel: string;
  fallIndex: number;
  springIndex: number;
}

export default function YearBlock({ yearLabel, fallIndex, springIndex }: YearBlockProps) {
  const fallSlots = usePlanStore((s) => s.semesters[fallIndex]);
  const springSlots = usePlanStore((s) => s.semesters[springIndex]);
  const yearTotal = calculateSemesterCredits(fallSlots) + calculateSemesterCredits(springSlots);

  return (
    <section className="year-block">
      <h3>{yearLabel} Year</h3>
      <div className="semesters">
        <SemesterTable semesterIndex={fallIndex} label="Fall" />
        <SemesterTable semesterIndex={springIndex} label="Spring" />
      </div>
      <div className="year-total-row">
        <span>{yearLabel} Year Total</span>
        <span className="year-total-value">{yearTotal}</span>
      </div>
    </section>
  );
}
