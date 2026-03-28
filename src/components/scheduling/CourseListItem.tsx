"use client";

import type { Course } from "@/types";
import { formatTime } from "@/utils/time";

interface CourseListItemProps {
  course: Course;
  onClick: () => void;
}

export default function CourseListItem({ course, onClick }: CourseListItemProps) {
  const timeStr = `${course.days.join("")} ${formatTime(course.startTime)}-${formatTime(course.endTime)}`;

  return (
    <li onClick={onClick}>
      <strong>{course.code}.{course.section}</strong> — {course.name}<br />
      <small>{timeStr} | {course.professor} | {course.credits} cr</small>
      {course.prerequisites && course.prerequisites.length > 0 && (
        <>
          <br />
          <small className="prereq-text">Prereqs: {course.prerequisites.join(", ")}</small>
        </>
      )}
    </li>
  );
}
