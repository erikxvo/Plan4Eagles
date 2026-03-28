import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PlanSlot } from "@/types";

const ROWS_PER_SEMESTER = 6;
const TOTAL_SEMESTERS = 8;

function createEmptySemesters(): PlanSlot[][] {
  return Array.from({ length: TOTAL_SEMESTERS }, () =>
    Array.from({ length: ROWS_PER_SEMESTER }, () => ({
      courseName: "",
      credits: "",
      grade: "",
    }))
  );
}

// Migrate old flat-array localStorage format to structured format
function migrateOldData(): PlanSlot[][] | null {
  try {
    const raw = localStorage.getItem("bc_career_planner_data");
    if (!raw) return null;
    const old = JSON.parse(raw);
    if (!old.grid || !Array.isArray(old.grid)) return null;

    // Old format: flat array alternating [courseName, credits, courseName, credits, ...]
    // 12 values per semester (6 courses × 2 fields)
    const semesters = createEmptySemesters();
    let gridIdx = 0;
    for (let sem = 0; sem < TOTAL_SEMESTERS; sem++) {
      for (let row = 0; row < ROWS_PER_SEMESTER; row++) {
        semesters[sem][row].courseName = old.grid[gridIdx] || "";
        gridIdx++;
        semesters[sem][row].credits = old.grid[gridIdx] || "";
        gridIdx++;
      }
    }

    // Migrate grades
    if (old.grades && Array.isArray(old.grades)) {
      let gradeIdx = 0;
      for (let sem = 0; sem < TOTAL_SEMESTERS; sem++) {
        for (let row = 0; row < ROWS_PER_SEMESTER; row++) {
          semesters[sem][row].grade = old.grades[gradeIdx] || "";
          gradeIdx++;
        }
      }
    }

    return semesters;
  } catch {
    return null;
  }
}

function migrateOldCheckedReqs(): string[] {
  try {
    const raw = localStorage.getItem("bc_career_planner_data");
    if (!raw) return [];
    const old = JSON.parse(raw);
    return old.checkedReqs || [];
  } catch {
    return [];
  }
}

function migrateOldMajor(): string {
  try {
    const raw = localStorage.getItem("bc_career_planner_data");
    if (!raw) return "";
    const old = JSON.parse(raw);
    return old.major || "";
  } catch {
    return "";
  }
}

interface PlanState {
  major: string;
  semesters: PlanSlot[][];
  checkedReqs: string[];
  setMajor: (id: string) => void;
  updateSlot: (semesterIndex: number, slotIndex: number, field: keyof PlanSlot, value: string) => void;
  toggleReq: (label: string) => void;
  resetPlan: () => void;
  importSchedule: (semesterIndex: number, courses: { name: string; credits: number }[]) => void;
}

export const usePlanStore = create<PlanState>()(
  persist(
    (set) => {
      // Try migrating old data on first load
      const migratedSemesters = migrateOldData();
      const initialSemesters = migratedSemesters || createEmptySemesters();
      const initialReqs = migratedSemesters ? migrateOldCheckedReqs() : [];
      const initialMajor = migratedSemesters ? migrateOldMajor() : "";

      return {
        major: initialMajor,
        semesters: initialSemesters,
        checkedReqs: initialReqs,

        setMajor: (id) => set({ major: id }),

        updateSlot: (semesterIndex, slotIndex, field, value) =>
          set((state) => {
            const newSemesters = state.semesters.map((sem, si) =>
              si === semesterIndex
                ? sem.map((slot, ri) =>
                    ri === slotIndex ? { ...slot, [field]: value } : slot
                  )
                : sem
            );
            return { semesters: newSemesters };
          }),

        toggleReq: (label) =>
          set((state) => {
            const exists = state.checkedReqs.includes(label);
            return {
              checkedReqs: exists
                ? state.checkedReqs.filter((r) => r !== label)
                : [...state.checkedReqs, label],
            };
          }),

        resetPlan: () =>
          set({
            major: "",
            semesters: createEmptySemesters(),
            checkedReqs: [],
          }),

        importSchedule: (semesterIndex, courses) =>
          set((state) => {
            const newSemesters = [...state.semesters.map((s) => [...s.map((sl) => ({ ...sl }))])];
            courses.forEach((course, i) => {
              if (i < ROWS_PER_SEMESTER) {
                newSemesters[semesterIndex][i].courseName = course.name;
                newSemesters[semesterIndex][i].credits = course.credits.toString();
              }
            });
            return { semesters: newSemesters };
          }),
      };
    },
    {
      name: "plan4eagles-plan",
    }
  )
);

// Semester labels
export const SEMESTER_LABELS = [
  "Freshman Fall", "Freshman Spring",
  "Sophomore Fall", "Sophomore Spring",
  "Junior Fall", "Junior Spring",
  "Senior Fall", "Senior Spring",
];

export const SEMESTER_IDS = [
  "freshman-fall", "freshman-spring",
  "sophomore-fall", "sophomore-spring",
  "junior-fall", "junior-spring",
  "senior-fall", "senior-spring",
];

export const YEAR_LABELS = ["Freshman", "Sophomore", "Junior", "Senior"];
