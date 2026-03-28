"use client";

import { usePlanStore } from "@/store/planStore";
import { gradeOptions } from "@/utils/gpa";

interface CourseRowProps {
  semesterIndex: number;
  slotIndex: number;
}

export default function CourseRow({ semesterIndex, slotIndex }: CourseRowProps) {
  const slot = usePlanStore((s) => s.semesters[semesterIndex][slotIndex]);
  const updateSlot = usePlanStore((s) => s.updateSlot);

  return (
    <div className="course-row">
      <input
        className="course-input"
        placeholder="Course"
        value={slot.courseName}
        onChange={(e) => updateSlot(semesterIndex, slotIndex, "courseName", e.target.value)}
      />
      <input
        className="credit-input"
        type="number"
        min="0"
        step="0.5"
        placeholder="0"
        value={slot.credits}
        onChange={(e) => updateSlot(semesterIndex, slotIndex, "credits", e.target.value)}
      />
      <select
        className="grade-select"
        value={slot.grade}
        onChange={(e) => updateSlot(semesterIndex, slotIndex, "grade", e.target.value)}
      >
        <option value="">--</option>
        {gradeOptions.map((g) => (
          <option key={g} value={g}>{g}</option>
        ))}
      </select>
    </div>
  );
}
