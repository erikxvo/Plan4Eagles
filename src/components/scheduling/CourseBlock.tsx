"use client";

import type { Course } from "@/types";
import { formatTime, timeToPosition, calculateDuration } from "@/utils/time";
import { getCourseColor } from "@/utils/courseColors";

interface CourseBlockProps {
  course: Course;
  uniqueId: string;
  gridStartHour: number;
  onRemove: (uniqueId: string) => void;
}

export default function CourseBlock({ course, uniqueId, gridStartHour, onRemove }: CourseBlockProps) {
  const color = getCourseColor(uniqueId);
  const top = timeToPosition(course.startTime, gridStartHour);
  const height = calculateDuration(course.startTime, course.endTime);

  return (
    <div
      className="course-block"
      style={{
        top: `${top}px`,
        height: `${height - 2}px`,
        background: color.bg,
        borderColor: color.border,
      }}
    >
      <strong>{course.code}.{course.section}</strong><br />
      {course.name}<br />
      <small>{formatTime(course.startTime)}-{formatTime(course.endTime)}</small>
      <span
        className="remove-btn"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(uniqueId);
        }}
      >
        ✕
      </span>
    </div>
  );
}
