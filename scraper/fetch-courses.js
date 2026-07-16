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
 * Beyond the raw field mapping, this scraper also:
 *   - fixes 0-credit sections (BC's own discussion/lab sections) getting
 *     coerced to 3 credits by a naive `parseInt(x) || 3`
 *   - parses each section's `coreq` free-text field into a `corequisites`
 *     course-code array, same way `prerequisites` is parsed
 *   - classifies every section within a course+term family as a
 *     "lecture", a "discussion", or neither, and - for discussions - works
 *     out which lecture section(s) it pairs with (see classifyFamily below)
 *   - preserves terms that used to be in the output but have rolled off
 *     BC's live feeds, so a term doesn't silently vanish just because the
 *     registrar stopped serving it (see preserveArchivedTerms below)
 *
 * Usage:
 *   node scraper/fetch-courses.js                   # Fetch Fall + Spring
 *   node scraper/fetch-courses.js --semester fall    # Fetch Fall only
 *   node scraper/fetch-courses.js --semester spring  # Fetch Spring only
 *   node scraper/fetch-courses.js --dept CSCI        # Filter by department
 *   node scraper/fetch-courses.js --dept CSCI,MATH   # Multiple departments
 *   node scraper/fetch-courses.js --no-preserve      # Don't carry over old terms
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

// Output path
const OUTPUT_PATH = path.join(__dirname, "..", "project", "data", "courses.json");

// ==========================================
// PARSE COMMAND LINE ARGS
// ==========================================

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    semesters: ["fall", "spring", "summer"],
    depts: null, // null = all departments
    undergraduateOnly: true,
    preserveArchivedTerms: true,
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
    } else if (args[i] === "--no-preserve") {
      config.preserveArchivedTerms = false;
    } else if (args[i] === "--help") {
      console.log(`
BC Course Data Scraper for Plan4Eagles

Usage:
  node scraper/fetch-courses.js [options]

Options:
  --semester <fall|spring|summer>  Fetch a specific semester (default: fall + spring)
  --dept <CODE,CODE,...>           Filter by department codes (e.g., CSCI,MATH)
  --all-levels                     Include graduate courses (default: undergrad only)
  --no-preserve                    Don't carry over terms missing from the live
                                    feeds; a term absent from both the fresh
                                    fetch AND the previous output simply
                                    won't appear (default: preserve them,
                                    marked status:"archived")
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
 * Returns one of:
 *   { type: "async" }                       - online asynchronous, no meeting times
 *   { type: "arranged" }                    - "By Arrangement" (independent study, lessons, etc.)
 *   { type: "tba" }                         - meeting time/room to be announced or unparseable
 *   { type: "scheduled", days, startTime, endTime, room, additionalMeetings }
 *
 * When a section has multiple meeting patterns (e.g. lecture + evening
 * discussion), the segment with the most meeting days is treated as primary
 * and the remaining patterns are preserved verbatim in additionalMeetings.
 */
function parseRoomSchedule(roomSchedule) {
  if (!roomSchedule || roomSchedule.includes("TBA")) {
    return { type: "tba" };
  }
  if (/arrangement/i.test(roomSchedule)) {
    return { type: "arranged" };
  }
  if (roomSchedule.includes("Asynchronous")) {
    return { type: "async" };
  }

  // Normalize "12:00 Noon" to "12:00PM" so the regex can parse it
  roomSchedule = roomSchedule.replace(/12:00 Noon/g, "12:00PM");

  // Some entries have notes or split room/schedule separated by semicolons, e.g.:
  //   "Stokes Hall 121N TuTh 01:30PM-02:45PM;US Residents Section"
  //   "McGuinn Hall B-14;W 12:30PM-01:00PM"
  // Parse every segment; non-parseable segments may hold room info or notes.
  const segments = roomSchedule.split(";").map((s) => s.trim()).filter(Boolean);

  const parsed = [];
  const unparsed = [];
  for (const segment of segments) {
    const result = parseScheduleSegment(segment);
    if (result) {
      parsed.push({ ...result, raw: segment });
    } else {
      unparsed.push(segment);
    }
  }

  if (parsed.length === 0) {
    return { type: "tba" };
  }

  // Primary pattern = the one meeting on the most days (lecture over lab/discussion)
  parsed.sort((a, b) => b.days.length - a.days.length);
  const primary = parsed[0];

  // If the primary segment had no room of its own, an unparsed segment is
  // often the room (e.g. "Devlin 008;M 07:15PM-08:45PM")
  if (!primary.room && unparsed.length > 0) {
    primary.room = unparsed[0];
  }

  return {
    type: "scheduled",
    days: primary.days,
    startTime: primary.startTime,
    endTime: primary.endTime,
    room: primary.room,
    additionalMeetings: parsed.slice(1).map((p) => p.raw),
  };
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
// PARSE PREREQUISITES / COREQUISITES
// ==========================================

/**
 * Extracts course codes from prerequisite/corequisite strings like:
 *   "CSCI110100 Computer Science I AND MATH110200 Calculus II"
 *   "ECON110100 AND MATH110000"
 *   "APSY1030/EDUC1030 or MCAP1030"
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
  const code = `${bcCourse.dept_code}${bcCourse.crs_number}`;

  // Bug fix: `parseInt(x) || 3` coerced legitimate 0-credit sections
  // (discussions, labs, some ROTC/music sections) to 3. Only fall back to 3
  // when the raw value genuinely doesn't parse as a number.
  const parsedCredits = parseInt(bcCourse.credits, 10);
  const credits = Number.isNaN(parsedCredits) ? 3 : parsedCredits;

  // BC's `coreq` field is free text, same shape as `prereq` - reuse the
  // same code-extraction regex. The regex can occasionally pick up the
  // course's own code inside cross-listing notes, so it's excluded.
  const corequisites = parsePrerequisites(bcCourse.coreq).filter((c) => c !== code);

  const base = {
    code,
    name: bcCourse.title,
    section: (bcCourse.section || "").padStart(2, "0"),
    credits,
    professor: formatProfessorName(bcCourse.instructors),
    description: cleanDescription(bcCourse.crs_desc),
    prerequisites: parsePrerequisites(bcCourse.prereq),
    corequisites,
    coreRequirement: bcCourse.core_list || null,
    semester: bcCourse.term,
  };

  // component/pairsWith are filled in later by classifyComponents(), once
  // every section for the course+term family has been transformed.
  const componentFields = { component: null, pairsWith: null };

  // Asynchronous / arranged / TBA sections have no placeable meeting time.
  // Keep them, clearly typed, so the app can list them honestly instead of
  // hiding them.
  if (schedule.type === "async" || schedule.type === "arranged" || schedule.type === "tba") {
    return {
      ...base,
      scheduleType: schedule.type,
      days: [],
      startTime: null,
      endTime: null,
      room: "",
      additionalMeetings: [],
      ...componentFields,
    };
  }

  if (schedule.days.length === 0) {
    return {
      ...base,
      scheduleType: "tba",
      days: [],
      startTime: null,
      endTime: null,
      room: schedule.room || "",
      additionalMeetings: [],
      ...componentFields,
    };
  }

  // Weekend sections keep their real meeting info but are flagged: the
  // weekly calendar only renders Monday-Friday.
  const isWeekend = schedule.days.some((d) => d === "Sa" || d === "Su");

  return {
    ...base,
    scheduleType: isWeekend ? "weekend" : "scheduled",
    days: schedule.days,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    room: schedule.room,
    additionalMeetings: schedule.additionalMeetings || [],
    ...componentFields,
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

/**
 * Converts a BC term code like "2026FALL" to a label like "Fall 2026"
 */
function termLabel(termCode) {
  const match = /^(\d{4})(FALL|SPRG|SUMM)$/.exec(termCode || "");
  if (!match) return termCode || "Unknown term";
  const seasons = { FALL: "Fall", SPRG: "Spring", SUMM: "Summer" };
  return `${seasons[match[2]]} ${match[1]}`;
}

/**
 * Sort key so terms order chronologically: Spring (~Jan) < Summer < Fall
 */
function termSortKey(termCode) {
  const match = /^(\d{4})(FALL|SPRG|SUMM)$/.exec(termCode || "");
  if (!match) return 0;
  const seasonOrder = { SPRG: 1, SUMM: 2, FALL: 3 };
  return parseInt(match[1]) * 10 + seasonOrder[match[2]];
}

// ==========================================
// COMPONENT + PAIRING CLASSIFICATION
// ==========================================

/**
 * BC lists discussion/lab sections as their own 0-credit "sections" living
 * in the same course+term family as the lecture(s) they go with. This
 * figures out, for every section, whether it IS a lecture, a discussion, or
 * neither - and for discussions, which lecture section(s) it pairs with.
 *
 * A "family" is all sections sharing the same course code + semester.
 * Within a family that has BOTH credit-bearing and 0-credit sections, the
 * 0-credit sections are discussions and the credit-bearing ones are
 * lectures. Families that are entirely 0-credit (ROTC labs, private music
 * lessons, etc.) or entirely credit-bearing have no lecture/discussion
 * split at all - component stays null for every section in them.
 *
 * Pairing heuristic for each discussion, checked in order (first match wins):
 *   1. Instructor match  - the discussion's professor is a real, named
 *      instructor (not "Staff"/"Dept, Dept"/"Dept assigned"/etc.) and
 *      teaches at least one lecture in the family -> pair with those
 *      lecture(s). (Handles multi-lecture courses where each professor's
 *      own discussions are taught by them, e.g. CHEM2231's Deak sections.)
 *   2. Single lecture     - exactly one lecture in the family -> every
 *      discussion pairs with it, regardless of instructor.
 *   3. Adjacency          - only when the family is "interleaved" (lectures
 *      and discussions are NOT neatly grouped lecture-block-then-
 *      discussion-block in section-number order) -> pair with the nearest
 *      PRECEDING lecture in sort order.
 *   4. Otherwise          - pairsWith stays null, meaning "any lecture of
 *      this course". Guessing here (e.g. via adjacency on a
 *      non-interleaved family) would produce a false signal.
 */

/**
 * A professor string counts as "anonymous" (no real instructor to match on)
 * when its surname part is "Staff" or starts with "Dept"/"Department"/"TBA"
 * - covers raw values like "Staff", "Dept, Dept" (-> "Prof. Dept") and
 * "Dept assigned" (-> "Prof. Dept assigned").
 */
function isAnonymousProfessor(professor) {
  if (!professor) return true;
  const surname = professor.startsWith("Prof. ") ? professor.slice(6) : professor;
  return /^(staff|dept|department|tba)/i.test(surname.trim());
}

/**
 * Section-number comparator: numeric when both sides are all-digits (so "2"
 * sorts before "10"), otherwise plain string comparison.
 */
function compareSectionNumbers(a, b) {
  const aIsNumeric = /^\d+$/.test(a);
  const bIsNumeric = /^\d+$/.test(b);
  if (aIsNumeric && bIsNumeric) return parseInt(a, 10) - parseInt(b, 10);
  return a.localeCompare(b);
}

/**
 * Classifies + pairs one course+term family in place.
 */
function classifyFamily(sections) {
  const lectures = sections.filter((s) => s.credits > 0);
  const zeroCredit = sections.filter((s) => s.credits === 0);

  // Needs both a lecture and a discussion present to mean anything.
  if (lectures.length === 0 || zeroCredit.length === 0) {
    sections.forEach((s) => {
      s.component = null;
      s.pairsWith = null;
    });
    return;
  }

  lectures.forEach((s) => {
    s.component = "lecture";
    s.pairsWith = null;
  });

  const sorted = [...sections].sort((a, b) => compareSectionNumbers(a.section, b.section));

  // Interleaved = at least one lecture appears AFTER a discussion in
  // section-number order (CHEM2231: 01 L, 02-05 D, 06 L, ...). If lectures
  // are all grouped before discussions (SOCY1001: 01-02 L, 03-08 D),
  // "nearest preceding lecture" isn't a real signal - every discussion
  // would trivially point at the last lecture.
  let sawDiscussion = false;
  let interleaved = false;
  for (const s of sorted) {
    if (s.credits === 0) {
      sawDiscussion = true;
    } else if (sawDiscussion) {
      interleaved = true;
      break;
    }
  }

  zeroCredit.forEach((d) => {
    d.component = "discussion";

    // 1. Instructor match
    if (!isAnonymousProfessor(d.professor)) {
      const matches = lectures.filter((l) => l.professor === d.professor);
      if (matches.length > 0) {
        d.pairsWith = matches.map((l) => l.section).sort(compareSectionNumbers);
        return;
      }
    }

    // 2. Single lecture in the family
    if (lectures.length === 1) {
      d.pairsWith = [lectures[0].section];
      return;
    }

    // 3. Adjacency, interleaved families only
    if (interleaved) {
      const idx = sorted.indexOf(d);
      for (let i = idx - 1; i >= 0; i--) {
        if (sorted[i].component === "lecture") {
          d.pairsWith = [sorted[i].section];
          return;
        }
      }
    }

    // 4. No reliable signal
    d.pairsWith = null;
  });
}

/**
 * Groups sections by code+semester and classifies each family. Mutates the
 * section objects in place. Run over BOTH freshly-fetched AND preserved
 * (archived) sections, so old snapshots get the same treatment.
 */
function classifyComponents(sections) {
  const families = new Map();
  sections.forEach((s) => {
    const key = `${s.code}||${s.semester}`;
    if (!families.has(key)) families.set(key, []);
    families.get(key).push(s);
  });
  families.forEach((family) => classifyFamily(family));
}

// ==========================================
// ARCHIVED TERM PRESERVATION
// ==========================================

/**
 * BC's term feeds roll over as registration windows open/close - a term's
 * feed can go empty well before that term even starts (e.g. the Spring feed
 * empties out once Fall goes live). Regenerating blindly from the live
 * feeds would silently delete any term they no longer carry. This reads the
 * PREVIOUS output file and, for any term present there but absent from the
 * fresh fetch, carries it forward verbatim - tagged status:"archived" so
 * the app knows it's a frozen snapshot rather than a live feed. A term that
 * comes back in the fresh feeds always wins over its stale copy.
 *
 * Preserved sections keep whatever schema they were originally written
 * with. If they pre-date this scraper version they'll be missing
 * `corequisites` - defaulted to [] here, since their raw `coreq` text is
 * gone and there's nothing to re-derive it from. Their `component`/
 * `pairsWith` ARE recomputed (via classifyComponents, called on the merged
 * list back in main()), so archived snapshots still benefit from pairing
 * heuristic improvements.
 */
function loadExistingOutput(outputPath) {
  if (!fs.existsSync(outputPath)) {
    console.log("  No existing output file found - nothing to preserve.");
    return null;
  }
  try {
    const raw = fs.readFileSync(outputPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.terms) || !Array.isArray(parsed.courses)) {
      console.log("  Existing output file is missing terms/courses arrays - skipping preservation.");
      return null;
    }
    return parsed;
  } catch (error) {
    console.log(`  Could not read/parse existing output (${error.message}) - skipping preservation.`);
    return null;
  }
}

function preserveArchivedTerms(existing, freshTermCodes) {
  const preservedTerms = [];
  const preservedCourses = [];

  if (!existing) return { preservedTerms, preservedCourses };

  existing.terms.forEach((term) => {
    if (!term || !term.code || freshTermCodes.has(term.code)) return; // fresh data wins

    const courses = existing.courses
      .filter((c) => c.semester === term.code)
      .map((c) => ({ ...c, corequisites: c.corequisites || [] }));

    preservedTerms.push({ ...term, status: term.status || "archived" });
    preservedCourses.push(...courses);

    console.log(`  Preserved archived term ${term.code} (${term.label || "unlabeled"}): ${courses.length} courses`);
  });

  return { preservedTerms, preservedCourses };
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
  console.log(`Undergraduate only: ${config.undergraduateOnly}`);
  console.log(`Preserve archived terms: ${config.preserveArchivedTerms}\n`);

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

  // Build department code -> name map from the registrar data itself
  const departments = {};
  filtered.forEach((c) => {
    if (c.dept_code && c.dept_name && !departments[c.dept_code]) {
      departments[c.dept_code] = c.dept_name;
    }
  });

  // Transform to app format (nothing is silently dropped anymore;
  // async/TBA/weekend sections are kept and typed)
  const freshSections = filtered
    .map(transformCourse)
    .filter((c) => c !== null);

  console.log(`After transform: ${freshSections.length}`);

  // ----- Archived term preservation -----
  const freshTermCodes = new Set(freshSections.map((c) => c.semester));
  let preservedTerms = [];
  let preservedCourses = [];

  if (config.preserveArchivedTerms) {
    console.log("\n--- Archived term preservation ---");
    const existing = loadExistingOutput(OUTPUT_PATH);
    ({ preservedTerms, preservedCourses } = preserveArchivedTerms(existing, freshTermCodes));
    if (preservedTerms.length === 0) {
      console.log("  Nothing to preserve.");
    }

    // Backfill department names for departments that only appear in
    // preserved terms (e.g. a dept offered in the archived term but not in
    // any currently-fetched term).
    if (existing && existing.departments) {
      preservedCourses.forEach((c) => {
        const dept = c.code.replace(/[0-9]/g, "");
        if (dept && !departments[dept] && existing.departments[dept]) {
          departments[dept] = existing.departments[dept];
        }
      });
    }
  } else {
    console.log("\n--no-preserve set: skipping archived term preservation.");
  }

  // Merge fresh + preserved, then classify lecture/discussion pairing over
  // the full set (preserved sections included, per the doc-comment above).
  const allSections = freshSections.concat(preservedCourses);
  classifyComponents(allSections);

  // Sort by department/course number, then section
  allSections.sort((a, b) => {
    if (a.code !== b.code) return a.code.localeCompare(b.code);
    if (a.semester !== b.semester) return termSortKey(a.semester) - termSortKey(b.semester);
    return compareSectionNumbers(a.section, b.section);
  });

  // Stats
  const deptCounts = {};
  const typeCounts = {};
  let multiPattern = 0;
  let lectureCount = 0;
  let discussionCount = 0;
  let pairedDiscussionCount = 0;
  let anyLectureDiscussionCount = 0;
  let corequisiteSectionCount = 0;
  allSections.forEach((c) => {
    const dept = c.code.replace(/[0-9]/g, "");
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
    typeCounts[c.scheduleType] = (typeCounts[c.scheduleType] || 0) + 1;
    if (c.additionalMeetings.length > 0) multiPattern++;
    if (c.component === "lecture") lectureCount++;
    if (c.component === "discussion") {
      discussionCount++;
      if (c.pairsWith && c.pairsWith.length > 0) {
        pairedDiscussionCount++;
      } else {
        anyLectureDiscussionCount++;
      }
    }
    if (c.corequisites && c.corequisites.length > 0) corequisiteSectionCount++;
  });

  console.log("\n--- Schedule types ---");
  Object.entries(typeCounts).forEach(([type, count]) => {
    console.log(`  ${type}: ${count} sections`);
  });
  console.log(`  (with additional meeting patterns: ${multiPattern})`);

  console.log("\n--- Lecture/discussion classification ---");
  console.log(`  lecture sections: ${lectureCount}`);
  console.log(`  discussion sections: ${discussionCount}`);
  console.log(`    paired to specific lecture(s): ${pairedDiscussionCount}`);
  console.log(`    any-lecture (pairsWith null): ${anyLectureDiscussionCount}`);
  console.log(`  sections with corequisites: ${corequisiteSectionCount}`);
  console.log(`  preserved archived terms: ${preservedTerms.length} (${preservedCourses.length} courses)`);

  console.log("\n--- Courses per Department ---");
  Object.entries(deptCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([dept, count]) => {
      console.log(`  ${dept}: ${count} sections`);
    });

  // Collect the terms actually present in the data: fresh terms + preserved
  // (archived) terms, fresh always winning on code collision.
  const freshTerms = [...freshTermCodes].sort((a, b) => termSortKey(a) - termSortKey(b))
    .map((code) => ({ code, label: termLabel(code) }));
  const terms = freshTerms
    .concat(preservedTerms)
    .sort((a, b) => termSortKey(a.code) - termSortKey(b.code));
  console.log(`\nTerms in output: ${terms.map((t) => `${t.label}${t.status ? ` [${t.status}]` : ""}`).join(", ") || "none"}`);

  // Write output (wrapper object with refresh metadata)
  const output = {
    generatedAt: new Date().toISOString(),
    terms,
    departments,
    courseCount: allSections.length,
    courses: allSections,
  };

  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${allSections.length} courses to ${OUTPUT_PATH}`);
  console.log("Done!\n");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
