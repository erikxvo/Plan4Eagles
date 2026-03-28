import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Course } from "@/types";
import { hasTimeConflict } from "@/utils/conflicts";
import { clearCourseColors } from "@/utils/courseColors";

interface ScheduleState {
  selectedSemester: string;
  // Per-semester scheduled course uniqueIds
  schedules: Record<string, string[]>;
  setSelectedSemester: (semester: string) => void;
  addCourse: (course: Course, allCourses: Course[], skipConflictCheck?: boolean) => string | null;
  removeCourse: (uniqueId: string) => void;
  clearSchedule: () => void;
  getCurrentScheduleIds: () => string[];
}

function getUniqueId(course: Course): string {
  return `${course.code}-${course.section}`;
}

export { getUniqueId };

export const useScheduleStore = create<ScheduleState>()(
  persist(
    (set, get) => ({
      selectedSemester: "",
      schedules: {},

      setSelectedSemester: (semester) => {
        clearCourseColors();
        set({ selectedSemester: semester });
      },

      addCourse: (course, allCourses, skipConflictCheck = false) => {
        const state = get();
        const semester = state.selectedSemester;
        if (!semester) return "Please select a semester first!";

        const uniqueId = getUniqueId(course);
        const currentIds = state.schedules[semester] || [];

        if (currentIds.includes(uniqueId)) {
          return `${course.code} Section ${course.section} is already on your schedule!`;
        }

        if (!skipConflictCheck) {
          // Get currently scheduled courses
          const scheduledCourses = currentIds
            .map((id) => allCourses.find((c) => getUniqueId(c) === id))
            .filter((c): c is Course => c !== undefined);

          const conflict = hasTimeConflict(course, scheduledCourses);
          if (conflict) {
            return `Time conflict! ${course.code} overlaps with ${conflict.code} (${conflict.name})`;
          }
        }

        set((state) => ({
          schedules: {
            ...state.schedules,
            [semester]: [...(state.schedules[semester] || []), uniqueId],
          },
        }));
        return null;
      },

      removeCourse: (uniqueId) =>
        set((state) => {
          const semester = state.selectedSemester;
          if (!semester) return state;
          return {
            schedules: {
              ...state.schedules,
              [semester]: (state.schedules[semester] || []).filter((id) => id !== uniqueId),
            },
          };
        }),

      clearSchedule: () =>
        set((state) => {
          const semester = state.selectedSemester;
          if (!semester) return state;
          clearCourseColors();
          return {
            schedules: {
              ...state.schedules,
              [semester]: [],
            },
          };
        }),

      getCurrentScheduleIds: () => {
        const state = get();
        return state.schedules[state.selectedSemester] || [];
      },
    }),
    {
      name: "plan4eagles-schedule",
    }
  )
);
