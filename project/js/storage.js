/* ============================================
   SHARED STORAGE UTILITIES - Plan4Eagles
   Loaded before each page script. Defines the
   localStorage keys used across the app plus
   safe read/write helpers and the plan-data
   format migration.
   ============================================ */

const STORAGE_KEYS = {
  PLAN: "bc_career_planner_data",
  SCHEDULE_PREFIX: "bc_career_planner_schedule_",
  SCHEDULE_META: "bc_career_planner_schedule_meta",
  SELECTED_SEMESTER: "bc_career_planner_selected_semester",
  EXPORT: "bc_career_planner_export",
};

const SEMESTER_IDS = [
  "freshman-fall",
  "freshman-spring",
  "sophomore-fall",
  "sophomore-spring",
  "junior-fall",
  "junior-spring",
  "senior-fall",
  "senior-spring",
];

function semesterDisplayName(semesterId) {
  if (typeof semesterId !== "string" || !semesterId.includes("-")) {
    return semesterId || "";
  }
  return semesterId
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const GRADE_POINTS = {
  "A": 4.0, "A-": 3.67,
  "B+": 3.33, "B": 3.0, "B-": 2.67,
  "C+": 2.33, "C": 2.0, "C-": 1.67,
  "D+": 1.33, "D": 1.0, "D-": 0.67,
  "F": 0.0,
};

/* ---------- Safe JSON helpers ---------- */

function readStoredJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`Could not read "${key}" from localStorage:`, e);
    return fallback;
  }
}

function writeStoredJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn(`Could not write "${key}" to localStorage:`, e);
    return false;
  }
}

function removeStored(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn(`Could not remove "${key}" from localStorage:`, e);
  }
}

/* ---------- Plan data (v2) ---------- */

/**
 * Plan data format v2:
 * {
 *   version: 2,
 *   major: "cs-ba",
 *   semesters: {
 *     "freshman-fall": [{ name, credits, grade }, ...],
 *     ... (one array per SEMESTER_IDS entry)
 *   },
 *   checkedReqs: ["Writing", ...]
 * }
 *
 * v1 (legacy) stored a flat `grid` array of interleaved course/credit input
 * values (8 semesters x 6 rows x 2) plus a parallel `grades` array.
 * loadPlanData() migrates v1 to v2 once, then always returns v2.
 */

function emptyPlanData() {
  const semesters = {};
  SEMESTER_IDS.forEach((id) => {
    semesters[id] = [];
  });
  return { version: 2, major: "", semesters, checkedReqs: [] };
}

function migratePlanV1toV2(v1) {
  const v2 = emptyPlanData();
  v2.major = typeof v1.major === "string" ? v1.major : "";
  v2.checkedReqs = Array.isArray(v1.checkedReqs) ? v1.checkedReqs.slice() : [];

  const grid = Array.isArray(v1.grid) ? v1.grid : [];
  const grades = Array.isArray(v1.grades) ? v1.grades : [];
  const ROWS_PER_SEMESTER = 6;

  SEMESTER_IDS.forEach((semesterId, semIndex) => {
    for (let row = 0; row < ROWS_PER_SEMESTER; row++) {
      const flatRow = semIndex * ROWS_PER_SEMESTER + row;
      const name = grid[flatRow * 2];
      const credits = grid[flatRow * 2 + 1];
      const grade = grades[flatRow];
      if ((name && String(name).trim()) || credits || grade) {
        v2.semesters[semesterId].push({
          name: name ? String(name).trim() : "",
          credits: credits !== undefined && credits !== "" ? String(credits) : "",
          grade: grade || "",
        });
      }
    }
  });

  return v2;
}

/**
 * Returns plan data in v2 format, or null when nothing valid is stored.
 * Migrates legacy v1 data on first read and writes the migrated copy back.
 */
function loadPlanData() {
  const data = readStoredJSON(STORAGE_KEYS.PLAN);
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;

  if (data.version === 2) {
    // Defensive: make sure every semester array exists
    if (!data.semesters || typeof data.semesters !== "object") {
      data.semesters = {};
    }
    SEMESTER_IDS.forEach((id) => {
      if (!Array.isArray(data.semesters[id])) {
        data.semesters[id] = [];
        return;
      }
      // Drop phantom blank/malformed entries — only real classes persist
      data.semesters[id] = data.semesters[id].filter(
        (course) =>
          course &&
          typeof course === "object" &&
          ((course.name && String(course.name).trim()) ||
            course.credits ||
            course.grade)
      );
    });
    if (!Array.isArray(data.checkedReqs)) data.checkedReqs = [];
    if (typeof data.major !== "string") data.major = "";
    return data;
  }

  if (Array.isArray(data.grid)) {
    const migrated = migratePlanV1toV2(data);
    writeStoredJSON(STORAGE_KEYS.PLAN, migrated);
    return migrated;
  }

  return null;
}

function savePlanData(planData) {
  writeStoredJSON(STORAGE_KEYS.PLAN, planData);
}

/* ---------- Derived plan stats (used by the dashboard) ---------- */

function computePlanStats(planData) {
  const stats = {
    totalCredits: 0,
    courseCount: 0,
    gpa: null,
    gradedCredits: 0,
  };
  if (!planData || !planData.semesters) return stats;

  let qualityPoints = 0;
  SEMESTER_IDS.forEach((id) => {
    (planData.semesters[id] || []).forEach((course) => {
      const credits = parseFloat(course.credits);
      if (!isNaN(credits) && credits > 0) {
        stats.totalCredits += credits;
        if (course.grade && GRADE_POINTS[course.grade] !== undefined) {
          qualityPoints += credits * GRADE_POINTS[course.grade];
          stats.gradedCredits += credits;
        }
      }
      if (course.name && course.name.trim()) stats.courseCount++;
    });
  });

  if (stats.gradedCredits > 0) {
    stats.gpa = qualityPoints / stats.gradedCredits;
  }
  return stats;
}
