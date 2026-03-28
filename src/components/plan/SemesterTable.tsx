"use client";

import { usePlanStore } from "@/store/planStore";
import { calculateSemesterGPA, calculateSemesterCredits } from "@/utils/gpa";
import CourseRow from "./CourseRow";

interface SemesterTableProps {
  semesterIndex: number;
  label: string;
}

export default function SemesterTable({ semesterIndex, label }: SemesterTableProps) {
  const slots = usePlanStore((s) => s.semesters[semesterIndex]);
  const totalCredits = calculateSemesterCredits(slots);
  const { gpa } = calculateSemesterGPA(slots);

  return (
    <div className="semester" data-semester-index={semesterIndex}>
      <h4>{label}</h4>
      <div className="semester-table">
        <div className="semester-header">
          <span>Course</span>
          <span>Credits</span>
          <span>Grade</span>
        </div>
        {slots.map((_, i) => (
          <CourseRow key={i} semesterIndex={semesterIndex} slotIndex={i} />
        ))}
        <div className="semester-footer">
          <span>Total Credits</span>
          <span className="semester-total">{totalCredits}</span>
          <span className="semester-gpa">{gpa !== null ? gpa.toFixed(2) : "--"}</span>
        </div>
      </div>
    </div>
  );
}
