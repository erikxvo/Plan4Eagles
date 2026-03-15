#!/usr/bin/env node

/**
 * BC Course Data Scraper
 *
 * Fetches course data from Boston College's public JSON APIs and converts it
 * into the format used by Plan4Eagles.
 *
 * Data sources (public, no auth required):
 *   - https://bcweb.bc.edu/aem/coursesfall.json
 *   - https://bcweb.bc.edu/aem/coursessprg.json
 *   - https://bcweb.bc.edu/aem/coursessumm.json
 *
 * Usage:
 *   node scraper/fetch-courses.js                   # Fetch Fall + Spring
 *   node scraper/fetch-courses.js --semester fall    # Fetch Fall only
 *   node scraper/fetch-courses.js --semester spring  # Fetch Spring only
 *   node scraper/fetch-courses.js --dept CSCI        # Filter by department
 *   node scraper/fetch-courses.js --dept CSCI,MATH   # Multiple departments
 */

const fs = require("fs");
const path = require("path");

// ==========================================
// CONFIGURATION
// ==========================================

const API_URLS = {
  fall: "https://bcweb.bc.edu/aem/coursesfall.json",
  spring: "https://bcweb.bc.edu/aem/coursessprg.json",
  summer: "https://bcweb.bc.edu/aem/coursessumm.json",
};

// Departments relevant to our app (can be expanded)
const TARGET_DEPTS = [
  "CSCI", "MATH", "ECON", "PHYS", "BIOL", "CHEM",
  "PSYC", "POLI", "ENGL", "PHIL", "THEO", "HIST",
  "SOCY", "COMM", "ARTS", "SPAN", "FREN", "GERM",
  "ITAL", "MUSA", "MUSP", "FILM", "AADS",
];

// Output path
const OUTPUT_PATH = path.join(__dirname, "..", "project", "data", "courses.json");

// ==========================================
// PARSE COMMAND LINE ARGS
// ==========================================

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    semesters: ["fall", "spring"],
    depts: null, // null = use TARGET_DEPTS
    undergraduateOnly: true,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--semester" && args[i + 1]) {
      const sem = args[i + 1].toLowerCase();
      if (API_URLS[sem]) {
        config.semesters = [sem];
      } else {
        console.error(`Unknown semester: ${args[i + 1]}. Use: fall, spring, summer`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === "--dept" && args[i + 1]) {
      config.depts = args[i + 1].toUpperCase().split(",");
      i++;
    } else if (args[i] === "--all-levels") {
      config.undergraduateOnly = false;
    } else if (args[i] === "--help") {
      console.log(`
BC Course Data Scraper for Plan4Eagles

Usage:
  node scraper/fetch-courses.js [options]

Options:
  --semester <fall|spring|summer>  Fetch a specific semester (default: fall + spring)
  --dept <CODE,CODE,...>           Filter by department codes (e.g., CSCI,MATH)
  --all-levels                     Include graduate courses (default: undergrad only)
  --help                           Show this help message

Examples:
  node scraper/fetch-courses.js
  node scraper/fetch-courses.js --semester fall
  node scraper/fetch-courses.js --dept CSCI,MATH,ECON
  node scraper/fetch-courses.js --semester fall --dept CSCI
      `);
      process.exit(0);
    }
  }

  return config;
}

// ==========================================
// FETCH DATA
// ==========================================

async function fetchSemesterData(semester) {
  const url = API_URLS[semester];
  console.log(`Fetching ${semester} courses from ${url}...`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const json = await response.json();
    // BC API wraps data in { msg, code, payload: [...] }
    const data = json.payload || json;
    const courses = Array.isArray(data) ? data : [];
    console.log(`  Received ${courses.length} total course sections for ${semester}`);
    return courses;
  } catch (error) {
    console.error(`  Error fetching ${semester} data:`, error.message);
    return [];
  }
}

// ==========================================
// PARSE room_schedule INTO DAYS + TIMES
// ==========================================

/**
 * Parses the room_schedule field like:
 *   "Fulton Hall 423 MWF 10:00AM-10:50AM"
 *   "Mcguinn Hall 121 TuTh 10:30AM-11:20AM"
 *   "Stokes Hall 133S MW 01:00PM-01:50PM"
 *   "On-line Asynchronous"
 *
 * Returns { days: ["M","W","F"], startTime: "10:00", endTime: "10:50", room: "Fulton Hall 423" }
 * or null if can't parse
 */
function parseRoomSchedule(roomSchedule) {
  if (!roomSchedule || roomSchedule.includes("Asynchronous") || roomSchedule.includes("TBA")) {
    return null;
  }

  // Normalize "12:00 Noon" to "12:00PM" so the regex can parse it
  roomSchedule = roomSchedule.replace(/12:00 Noon/g, "12:00PM");

  // Some entries have notes or split room/schedule separated by semicolons, e.g.:
  //   "Stokes Hall 121N TuTh 01:30PM-02:45PM;US Residents Section"
  //   "McGuinn Hall B-14;W 12:30PM-01:00PM"
  // Try each segment until one parses successfully
  const segments = roomSchedule.split(";").map((s) => s.trim());

  for (const segment of segments) {
    const result = parseScheduleSegment(segment);
    if (result) {
      // If parsed without a room, check other segments for room info
      if (!result.room) {
        for (const other of segments) {
          const trimmed = other.trim();
          if (trimmed !== segment && !parseScheduleSegment(trimmed)) {
            result.room = trimmed;
            break;
          }
        }
      }
      return result;
    }
  }

  return null;
}

/**
 * Tries to parse a single schedule segment (no semicolons).
 * Returns { room, days, startTime, endTime } or null.
 */
function parseScheduleSegment(text) {
  // Pattern: <room info> <days> <start>-<end>
  // Days can be: M, Tu, W, Th, F, Sa, Su (and combinations)
  const scheduleRegex = /^(.*?)\s+((?:M|Tu|W|Th|F|Sa|Su)+)\s+(\d{1,2}:\d{2}(?:AM|PM))-(\d{1,2}:\d{2}(?:AM|PM))$/;
  const match = text.match(scheduleRegex);

  if (match) {
    return {
      room: match[1].trim(),
      days: parseDayString(match[2]),
      startTime: convertTo24Hour(match[3]),
      endTime: convertTo24Hour(match[4]),
    };
  }

  // Try without room info (some entries have just days and times)
  const noRoomRegex = /^((?:M|Tu|W|Th|F|Sa|Su)+)\s+(\d{1,2}:\d{2}(?:AM|PM))-(\d{1,2}:\d{2}(?:AM|PM))$/;
  const noRoomMatch = text.match(noRoomRegex);
  if (noRoomMatch) {
    return {
      room: "",
      days: parseDayString(noRoomMatch[1]),
      startTime: convertTo24Hour(noRoomMatch[2]),
      endTime: convertTo24Hour(noRoomMatch[3]),
    };
  }

  return null;
}

/**
 * Parses day string like "MWF" or "TuTh" into array ["M","W","F"] or ["T","Th"]
 * BC uses: M, Tu, W, Th, F, Sa, Su
 * Our app uses: M, T, W, Th, F
 */
function parseDayString(dayStr) {
  const days = [];
  let i = 0;

  while (i < dayStr.length) {
    if (dayStr[i] === "M") {
      days.push("M");
      i++;
    } else if (dayStr.substring(i, i + 2) === "Tu") {
      days.push("T"); // Convert "Tu" to "T" for our app format
      i += 2;
    } else if (dayStr[i] === "W") {
      days.push("W");
      i++;
    } else if (dayStr.substring(i, i + 2) === "Th") {
      days.push("Th");
      i += 2;
    } else if (dayStr[i] === "F") {
      days.push("F");
      i++;
    } else if (dayStr.substring(i, i + 2) === "Sa") {
      days.push("Sa");
      i += 2;
    } else if (dayStr.substring(i, i + 2) === "Su") {
      days.push("Su");
      i += 2;
    } else {
      i++; // Skip unknown character
    }
  }

  return days;
}

/**
 * Converts "10:30AM" or "01:00PM" to "10:30" or "13:00" (24-hour format)
 */
function convertTo24Hour(timeStr) {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})(AM|PM)$/);
  if (!match) return timeStr;

  let hours = parseInt(match[1]);
  const minutes = match[2];
  const period = match[3];

  if (period === "PM" && hours !== 12) {
    hours += 12;
  } else if (period === "AM" && hours === 12) {
    hours = 0;
  }

  return `${hours.toString().padStart(2, "0")}:${minutes}`;
}

// ==========================================
// PARSE PREREQUISITES
// ==========================================

/**
 * Extracts course codes from prerequisite strings like:
 *   "CSCI110100 Computer Science I AND MATH110200 Calculus II"
 *   "ECON110100 AND MATH110000"
 *   null
 * Returns array of course codes like ["CSCI1101", "MATH1102"]
 */
function parsePrerequisites(prereqStr) {
  if (!prereqStr) return [];

  // Match patterns like CSCI1101, MATH2210, etc.
  const codePattern = /([A-Z]{4})\s*(\d{4})/g;
  const prereqs = [];
  let match;

  while ((match = codePattern.exec(prereqStr)) !== null) {
    const code = `${match[1]}${match[2]}`;
    if (!prereqs.includes(code)) {
      prereqs.push(code);
    }
  }

  return prereqs;
}

// ==========================================
// TRANSFORM TO APP FORMAT
// ==========================================

function transformCourse(bcCourse) {
  const schedule = parseRoomSchedule(bcCourse.room_schedule);

  // Skip courses we can't parse schedule for
  if (!schedule) return null;

  // Skip weekend classes
  if (schedule.days.some((d) => d === "Sa" || d === "Su")) return null;

  // Skip if no days
  if (schedule.days.length === 0) return null;

  return {
    code: `${bcCourse.dept_code}${bcCourse.crs_number}`,
    name: bcCourse.title,
    section: bcCourse.section.padStart(2, "0"),
    credits: parseInt(bcCourse.credits) || 3,
    days: schedule.days,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    professor: formatProfessorName(bcCourse.instructors),
    description: cleanDescription(bcCourse.crs_desc),
    prerequisites: parsePrerequisites(bcCourse.prereq),
    coreRequirement: bcCourse.core_list || null,
    room: schedule.room,
    semester: bcCourse.term,
  };
}

/**
 * Converts "Smith, Michael J" to "Prof. Smith"
 */
function formatProfessorName(instructorStr) {
  if (!instructorStr || instructorStr === "Staff") return "Staff";
  const lastName = instructorStr.split(",")[0].trim();
  return `Prof. ${lastName}`;
}

/**
 * Cleans up description text
 */
function cleanDescription(desc) {
  if (!desc) return "";
  return desc
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 300); // Truncate long descriptions
}

// ==========================================
// MAIN
// ==========================================

async function main() {
  const config = parseArgs();
  const targetDepts = config.depts || null; // null = all departments

  console.log("\n=== BC Course Data Scraper ===\n");
  console.log(`Semesters: ${config.semesters.join(", ")}`);
  console.log(`Departments: ${targetDepts ? targetDepts.join(", ") : "ALL"}`);
  console.log(`Undergraduate only: ${config.undergraduateOnly}\n`);

  // Fetch all semester data
  let allRawCourses = [];
  for (const semester of config.semesters) {
    const data = await fetchSemesterData(semester);
    allRawCourses = allRawCourses.concat(data);
  }

  console.log(`\nTotal raw records fetched: ${allRawCourses.length}`);

  // Filter by department (if specified) and level
  let filtered = targetDepts
    ? allRawCourses.filter((c) => targetDepts.includes(c.dept_code))
    : allRawCourses;
  console.log(`After department filter: ${filtered.length}`);

  if (config.undergraduateOnly) {
    filtered = filtered.filter((c) => c.student_level === "Undergraduate" || c.student_level === "Both");
    console.log(`After undergraduate filter: ${filtered.length}`);
  }

  // Transform to app format
  const transformed = filtered
    .map(transformCourse)
    .filter((c) => c !== null);

  console.log(`After schedule parsing: ${transformed.length}`);

  // Sort by department, course number, section
  transformed.sort((a, b) => {
    if (a.code !== b.code) return a.code.localeCompare(b.code);
    return a.section.localeCompare(b.section);
  });

  // Stats
  const deptCounts = {};
  transformed.forEach((c) => {
    const dept = c.code.replace(/[0-9]/g, "");
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  });

  console.log("\n--- Courses per Department ---");
  Object.entries(deptCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([dept, count]) => {
      console.log(`  ${dept}: ${count} sections`);
    });

  // Write output
  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(transformed, null, 2));
  console.log(`\nWrote ${transformed.length} courses to ${OUTPUT_PATH}`);
  console.log("Done!\n");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
