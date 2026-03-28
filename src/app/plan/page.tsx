"use client";

import { useEffect, useRef } from "react";
import RequirementsSidebar from "@/components/plan/RequirementsSidebar";
import YearBlock from "@/components/plan/YearBlock";
import { usePlanStore, YEAR_LABELS, SEMESTER_IDS } from "@/store/planStore";
import { useScheduleStore } from "@/store/scheduleStore";
import styles from "./plan.module.css";

export default function PlanPage() {
  const importSchedule = usePlanStore((s) => s.importSchedule);
  const importHandled = useRef(false);

  // Handle import from scheduling page
  useEffect(() => {
    if (importHandled.current) return;
    importHandled.current = true;

    const exportJSON = localStorage.getItem("bc_career_planner_export");
    if (!exportJSON) return;

    try {
      const exportData = JSON.parse(exportJSON);
      const semesterIndex = SEMESTER_IDS.indexOf(exportData.semester);
      if (semesterIndex !== -1 && exportData.courses) {
        importSchedule(semesterIndex, exportData.courses);
      }
      localStorage.removeItem("bc_career_planner_export");
    } catch (e) {
      console.error("Error importing schedule:", e);
    }
  }, [importSchedule]);

  return (
    <div className={styles.plannerContainer}>
      <RequirementsSidebar />
      <main className={styles.yearGrid}>
        {YEAR_LABELS.map((year, i) => (
          <YearBlock
            key={year}
            yearLabel={year}
            fallIndex={i * 2}
            springIndex={i * 2 + 1}
          />
        ))}
      </main>
    </div>
  );
}
