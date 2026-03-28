import type { Course } from "@/types";

function timesOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  return toMin(start1) < toMin(end2) && toMin(end1) > toMin(start2);
}

export function hasTimeConflict(
  newCourse: Course,
  scheduledCourses: Course[]
): Course | null {
  for (const day of newCourse.days) {
    const sameDayCourses = scheduledCourses.filter((c) => c.days.includes(day));
    for (const existing of sameDayCourses) {
      if (timesOverlap(newCourse.startTime, newCourse.endTime, existing.startTime, existing.endTime)) {
        return existing;
      }
    }
  }
  return null;
}
