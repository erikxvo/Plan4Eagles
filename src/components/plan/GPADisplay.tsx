"use client";

import { usePlanStore } from "@/store/planStore";
import { calculateCumulativeGPA } from "@/utils/gpa";

export default function GPADisplay() {
  const semesters = usePlanStore((s) => s.semesters);
  const { gpa, gradedCredits } = calculateCumulativeGPA(semesters);

  return (
    <>
      <div className="gpa-display">
        <span className="gpa-value">{gpa !== null ? gpa.toFixed(2) : "--"}</span>
        <span className="gpa-label">Cumulative GPA</span>
      </div>
      <div className="gpa-summary">
        {gradedCredits > 0
          ? `Based on ${gradedCredits} graded credits`
          : "Enter grades to calculate GPA"}
      </div>
    </>
  );
}
