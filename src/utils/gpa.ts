import type { PlanSlot } from "@/types";

export const gradePoints: Record<string, number> = {
  "A": 4.0, "A-": 3.67,
  "B+": 3.33, "B": 3.0, "B-": 2.67,
  "C+": 2.33, "C": 2.0, "C-": 1.67,
  "D+": 1.33, "D": 1.0, "D-": 0.67,
  "F": 0.0,
};

export const gradeOptions = ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];

export function calculateSemesterGPA(slots: PlanSlot[]): { gpa: number | null; credits: number; qualityPoints: number } {
  let totalQP = 0;
  let totalCredits = 0;

  for (const slot of slots) {
    const credits = parseFloat(slot.credits);
    const grade = slot.grade;
    if (!isNaN(credits) && credits > 0 && grade && gradePoints[grade] !== undefined) {
      totalQP += credits * gradePoints[grade];
      totalCredits += credits;
    }
  }

  return {
    gpa: totalCredits > 0 ? totalQP / totalCredits : null,
    credits: totalCredits,
    qualityPoints: totalQP,
  };
}

export function calculateCumulativeGPA(allSemesters: PlanSlot[][]): { gpa: number | null; gradedCredits: number } {
  let totalQP = 0;
  let totalCredits = 0;

  for (const semester of allSemesters) {
    const result = calculateSemesterGPA(semester);
    totalQP += result.qualityPoints;
    totalCredits += result.credits;
  }

  return {
    gpa: totalCredits > 0 ? totalQP / totalCredits : null,
    gradedCredits: totalCredits,
  };
}

export function calculateSemesterCredits(slots: PlanSlot[]): number {
  let sum = 0;
  for (const slot of slots) {
    const val = parseFloat(slot.credits);
    if (!isNaN(val)) sum += val;
  }
  return sum;
}
