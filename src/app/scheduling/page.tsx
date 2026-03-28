"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useCourseData } from "@/hooks/useCourseData";
import { useFilteredCourses } from "@/hooks/useFilteredCourses";
import { useScheduleStore, getUniqueId } from "@/store/scheduleStore";
import type { Course } from "@/types";
import CourseListItem from "@/components/scheduling/CourseListItem";
import TimeColumn from "@/components/scheduling/TimeColumn";
import DayColumn from "@/components/scheduling/DayColumn";
import styles from "./scheduling.module.css";

const DAYS = [
  { code: "M", label: "Monday" },
  { code: "T", label: "Tuesday" },
  { code: "W", label: "Wednesday" },
  { code: "Th", label: "Thursday" },
  { code: "F", label: "Friday" },
];

const SEMESTERS = [
  { value: "freshman-fall", label: "Freshman Fall" },
  { value: "freshman-spring", label: "Freshman Spring" },
  { value: "sophomore-fall", label: "Sophomore Fall" },
  { value: "sophomore-spring", label: "Sophomore Spring" },
  { value: "junior-fall", label: "Junior Fall" },
  { value: "junior-spring", label: "Junior Spring" },
  { value: "senior-fall", label: "Senior Fall" },
  { value: "senior-spring", label: "Senior Spring" },
];

const DEPT_NAMES: Record<string, string> = {
  CSCI: "Computer Science", MATH: "Mathematics", ECON: "Economics",
  PHYS: "Physics", BIOL: "Biology", CHEM: "Chemistry",
  PSYC: "Psychology", POLI: "Political Science", ENGL: "English",
  PHIL: "Philosophy", THEO: "Theology", HIST: "History",
  SOCY: "Sociology", ARTS: "Arts", SPAN: "Spanish", FREN: "French",
};

export default function SchedulingPage() {
  const router = useRouter();
  const { courses, isLoading, error, gridRange } = useCourseData();
  const [searchTerm, setSearchTerm] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [semesterDataFilter, setSemesterDataFilter] = useState("");

  const selectedSemester = useScheduleStore((s) => s.selectedSemester);
  const setSelectedSemester = useScheduleStore((s) => s.setSelectedSemester);
  const schedules = useScheduleStore((s) => s.schedules);
  const addCourse = useScheduleStore((s) => s.addCourse);
  const removeCourse = useScheduleStore((s) => s.removeCourse);
  const clearSchedule = useScheduleStore((s) => s.clearSchedule);

  const filteredCourses = useFilteredCourses(courses, searchTerm, deptFilter, semesterDataFilter);

  // Get unique departments from loaded courses
  const departments = useMemo(() => {
    const depts = new Map<string, string>();
    courses.forEach((course) => {
      const prefix = course.code.replace(/[0-9]/g, "");
      if (!depts.has(prefix)) {
        depts.set(prefix, DEPT_NAMES[prefix] || prefix);
      }
    });
    return Array.from(depts.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [courses]);

  // Get scheduled courses for current semester
  const currentScheduleIds = schedules[selectedSemester] || [];
  const scheduledCourses = useMemo(() => {
    return currentScheduleIds
      .map((id) => {
        const course = courses.find((c) => getUniqueId(c) === id);
        return course ? { course, uniqueId: id } : null;
      })
      .filter((c): c is { course: Course; uniqueId: string } => c !== null);
  }, [currentScheduleIds, courses]);

  const totalCredits = useMemo(() => {
    return scheduledCourses.reduce((sum, c) => sum + c.course.credits, 0);
  }, [scheduledCourses]);

  const handleAddCourse = useCallback((course: Course) => {
    const error = addCourse(course, courses);
    if (error) alert(error);
  }, [addCourse, courses]);

  const handleRemove = useCallback((uniqueId: string) => {
    removeCourse(uniqueId);
  }, [removeCourse]);

  const handleReset = () => {
    if (!selectedSemester) {
      alert("Please select a semester first!");
      return;
    }
    const name = SEMESTERS.find((s) => s.value === selectedSemester)?.label || selectedSemester;
    if (confirm(`Are you sure you want to clear your ${name} schedule? This cannot be undone.`)) {
      clearSchedule();
    }
  };

  const handleExport = () => {
    if (!selectedSemester) {
      alert("Please select a semester before exporting!");
      return;
    }
    if (scheduledCourses.length === 0) {
      alert("No courses to export! Add some courses to your schedule first.");
      return;
    }

    const exportData = {
      semester: selectedSemester,
      courses: scheduledCourses.map((c) => ({
        name: c.course.name,
        credits: c.course.credits,
      })),
    };

    localStorage.setItem("bc_career_planner_export", JSON.stringify(exportData));
    router.push("/plan");
  };

  if (error) return <div style={{ padding: 40, textAlign: "center" }}>{error}</div>;

  return (
    <div className={styles.scheduleContainer}>
      {/* LEFT: COURSE SEARCH */}
      <aside className={styles.courseSearch}>
        <h2>Course List</h2>
        <input
          className={styles.searchBox}
          type="text"
          placeholder="Search courses..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <div className={styles.filterRow}>
          <select
            className={styles.filterSelect}
            value={semesterDataFilter}
            onChange={(e) => setSemesterDataFilter(e.target.value)}
          >
            <option value="">All Semesters</option>
            <option value="2026FALL">Fall 2026</option>
            <option value="2026SPRG">Spring 2026</option>
          </select>
          <select
            className={styles.filterSelect}
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
          >
            <option value="">All Departments</option>
            {departments.map(([code, name]) => (
              <option key={code} value={code}>{code} - {name}</option>
            ))}
          </select>
        </div>
        <button className="btn-secondary" style={{ width: "100%", marginBottom: 10 }} onClick={handleExport}>
          Export to 4-Year Plan
        </button>
        <button className="btn-primary" style={{ width: "100%", marginBottom: 15 }} onClick={handleReset}>
          Reset Schedule
        </button>
        {isLoading ? (
          <p style={{ color: "#888", textAlign: "center" }}>Loading courses...</p>
        ) : (
          <ul className={styles.courseList}>
            {filteredCourses.slice(0, 200).map((course, index) => (
              <CourseListItem
                key={`${course.code}-${course.section}`}
                course={course}
                onClick={() => handleAddCourse(course)}
              />
            ))}
            {filteredCourses.length > 200 && (
              <li style={{ textAlign: "center", color: "#888", cursor: "default", border: "none" }}>
                Showing 200 of {filteredCourses.length} results. Narrow your search.
              </li>
            )}
          </ul>
        )}
      </aside>

      {/* RIGHT: TIME GRID */}
      <main className={styles.weekGrid}>
        <div className={styles.scheduleHeader}>
          <h2 className={styles.title}>Weekly Schedule</h2>
          <div className={styles.scheduleControls}>
            <select
              className={styles.semesterSelect}
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value)}
            >
              <option value="">Select Semester</option>
              {SEMESTERS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <div className={styles.creditCounter}>
              Total Credits: <span>{totalCredits}</span>
            </div>
          </div>
        </div>

        <div className={styles.scheduleGrid}>
          <TimeColumn startHour={gridRange.startHour} endHour={gridRange.endHour} />
          {DAYS.map((day) => (
            <DayColumn
              key={day.code}
              dayCode={day.code}
              dayLabel={day.label}
              courses={scheduledCourses}
              gridStartHour={gridRange.startHour}
              gridEndHour={gridRange.endHour}
              onRemove={handleRemove}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
