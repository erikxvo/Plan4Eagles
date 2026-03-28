"use client";

import { useMemo } from "react";
import type { Course } from "@/types";

export function useFilteredCourses(
  courses: Course[],
  searchTerm: string,
  department: string,
  semester: string
) {
  return useMemo(() => {
    const term = searchTerm.toLowerCase();
    return courses.filter((course) => {
      const matchesSearch = !term || `${course.code} ${course.name} ${course.professor}`.toLowerCase().includes(term);
      const matchesDept = !department || course.code.replace(/[0-9]/g, "") === department;
      const matchesSemester = !semester || course.semester === semester;
      return matchesSearch && matchesDept && matchesSemester;
    });
  }, [courses, searchTerm, department, semester]);
}
