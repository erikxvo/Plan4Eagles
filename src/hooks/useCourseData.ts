"use client";

import { useState, useEffect, useMemo } from "react";
import type { Course } from "@/types";
import { DEFAULT_START_HOUR, DEFAULT_END_HOUR } from "@/utils/time";

export function useCourseData() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/courses.json")
      .then((res) => res.json())
      .then((data) => {
        setCourses(data);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Error loading course data:", err);
        setError("Failed to load course data.");
        setIsLoading(false);
      });
  }, []);

  const gridRange = useMemo(() => {
    if (courses.length === 0) {
      return { startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR };
    }

    let earliestMinutes = Infinity;
    let latestMinutes = -Infinity;

    courses.forEach((course) => {
      const [sh, sm] = course.startTime.split(":").map(Number);
      const [eh, em] = course.endTime.split(":").map(Number);
      const startTotal = sh * 60 + sm;
      const endTotal = eh * 60 + em;
      if (startTotal < earliestMinutes) earliestMinutes = startTotal;
      if (endTotal > latestMinutes) latestMinutes = endTotal;
    });

    let startHour = Math.floor(earliestMinutes / 60);
    let endHour = Math.ceil(latestMinutes / 60);
    if (endHour <= startHour) endHour = startHour + 1;

    return { startHour, endHour };
  }, [courses]);

  return { courses, isLoading, error, gridRange };
}
