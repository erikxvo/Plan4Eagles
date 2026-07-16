#!/usr/bin/env node

/**
 * BC Course Evaluation Scraper
 *
 * Fetches historical course-evaluation scores from Boston College's public
 * (no-auth) Explorance Blue "BPI" course-evaluation viewer and converts them
 * into the format used by Plan4Eagles.
 *
 * Data source (public, no auth required, but UNDOCUMENTED/internal):
 *   https://avalanche.bc.edu/BPI/fbview.aspx?userid=&blockid=G1dMvrIMu&culture=en
 *
 * This is an internal Explorance Blue "BPI" (Blue Public Interface?) viewer
 * that BC exposes without login. It is not a documented/versioned API, so it
 * can change or move without notice. If requests here start failing, re-derive
 * the contract by hand:
 *   1. Open the URL above in a real browser.
 *   2. Open DevTools -> Network, filter to XHR/Fetch.
 *   3. Reload the page and step through the grid (change pages / sort) to
 *      trigger requests to `fbview-WebService.asmx/getFbViewInfo` and
 *      `fbview-WebService.asmx/getFbvGrid`.
 *   4. Copy the new request URL(s), JSON body shape, and any required
 *      headers/cookies from the "Headers" and "Payload" tabs, and update the
 *      constants/functions below to match.
 *
 * Known request flow (verified live, July 2026):
 *   Step 1 (session):
 *     GET the viewer URL above. Collect any Set-Cookie response headers and
 *     resend them as a "name=value; name2=value2" Cookie header on every
 *     subsequent POST. (The service may not strictly require this, but
 *     sending it is harmless and cheap insurance against session checks.)
 *
 *   Step 2 (resolve grid config):
 *     POST .../fbview-WebService.asmx/getFbViewInfo
 *     body: {"strUiCulture":"","blockId":"G1dMvrIMu","userId":"","fbvType":""}
 *     The response's `d` field is a JSON-encoded STRING (ASMX quirk) that
 *     must itself be JSON.parse()'d. It resolves the public "G1dMvrIMu"
 *     block id to the internal numeric ids (blockId, Datasource1ID, ...)
 *     used by the grid endpoint below. As of July 2026 these resolve to
 *     blockId "30" / Datasource1ID "560" — used only as a documented
 *     fallback if the service response is ever missing these fields.
 *
 *   Step 3 (page through the grid):
 *     POST .../fbview-WebService.asmx/getFbvGrid, pageSize 500, one page at
 *     a time (pageActuelle 1, 2, 3, ...). The response's `d` field is a
 *     7-element array: d[0] is the grid's HTML <table>, d[2] is a string
 *     like "Total Items 28,711" giving the true row count across all pages.
 *     Each page takes ~7-14s server-side; we sleep briefly between requests
 *     and retry transient failures with exponential backoff.
 *
 * Output format: this file writes COMPACT (non-pretty) JSON to keep the
 * ~4000-course, ~28000-row dataset's file size down (pretty-printing would
 * roughly double it for no functional benefit — it's machine-consumed).
 *
 * Usage:
 *   node scraper/fetch-evaluations.js                    # full scrape (all pages)
 *   node scraper/fetch-evaluations.js --max-pages 2       # smoke test (see below)
 *   node scraper/fetch-evaluations.js --help
 *
 * --max-pages <n> smoke-test mode:
 *   Fetches only the first <n> grid pages instead of all of them. Since the
 *   dataset is intentionally incomplete in this mode, two things change:
 *     - The row-count integrity check (raw rows fetched === server-reported
 *       "Total Items") is skipped, because it would always fail on purpose.
 *     - Output is written to a scratch path under the OS temp directory
 *       (see SMOKE_TEST_OUTPUT_PATH below), NOT to the real
 *       project/data/evaluations.json, and a few parsed sample courses are
 *       printed to the console for manual inspection. This lets you validate
 *       parsing end-to-end in ~30-60s without risking a partial/corrupt
 *       write to the file the app actually reads, and without waiting for
 *       the full ~10-15 minute run.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

// ==========================================
// CONFIGURATION
// ==========================================

// Public block id from the viewer URL's `blockid` query param. This is
// distinct from the internal numeric block id resolved via getFbViewInfo
// below (they happen to both be called "blockId" in BC's own API, which is
// confusing — we keep them in separate variables throughout this file).
const SOURCE_BLOCK_ID = "G1dMvrIMu";

const VIEWER_URL = `https://avalanche.bc.edu/BPI/fbview.aspx?userid=&blockid=${SOURCE_BLOCK_ID}&culture=en`;
const GET_FBVIEW_INFO_URL = "https://avalanche.bc.edu/BPI/fbview-WebService.asmx/getFbViewInfo";
const GET_FBV_GRID_URL = "https://avalanche.bc.edu/BPI/fbview-WebService.asmx/getFbvGrid";

// Documented fallback values (live-verified July 2026) used only if
// getFbViewInfo's response is missing the fields we need.
const FALLBACK_RESOLVED_BLOCK_ID = "30";
const FALLBACK_DATASOURCE_ID = "560";

const PAGE_SIZE = 500;
const PAGE_DELAY_MS = 300;
const RETRY_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [1000, 2000, 4000];

const REQUEST_HEADERS_JSON = {
  "Content-Type": "application/json; charset=UTF-8",
  "User-Agent": "Mozilla/5.0 (compatible; Plan4EaglesEvaluationScraper/1.0)",
};

// Output paths
const OUTPUT_PATH = path.join(__dirname, "..", "project", "data", "evaluations.json");
// pid suffix: avoid clobbering (or trusting) another process's file in the shared tmp dir
const SMOKE_TEST_OUTPUT_PATH = path.join(os.tmpdir(), `plan4eagles-evaluations-smoke-test-${process.pid}.json`);

// ==========================================
// PARSE COMMAND LINE ARGS
// ==========================================

function parseArgs() {
  const args = process.argv.slice(2);
  const config = { maxPages: null };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--max-pages" && args[i + 1]) {
      const n = parseInt(args[i + 1], 10);
      if (!Number.isInteger(n) || n < 1) {
        console.error(`Invalid --max-pages value: ${args[i + 1]}`);
        process.exit(1);
      }
      config.maxPages = n;
      i++;
    } else if (args[i] === "--help") {
      console.log(`
BC Course Evaluation Scraper for Plan4Eagles

Usage:
  node scraper/fetch-evaluations.js [options]

Options:
  --max-pages <n>   Smoke-test mode: fetch only the first <n> grid pages
                     instead of all (~58). Skips the row-count integrity
                     check and writes to a temp path (${SMOKE_TEST_OUTPUT_PATH})
                     instead of project/data/evaluations.json.
  --help            Show this help message

Examples:
  node scraper/fetch-evaluations.js
  node scraper/fetch-evaluations.js --max-pages 2
      `);
      process.exit(0);
    }
  }

  return config;
}

// ==========================================
// SMALL HELPERS
// ==========================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retry(fn, label) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < RETRY_ATTEMPTS) {
        const backoff = RETRY_BACKOFF_MS[attempt - 1];
        console.warn(`  ${label} attempt ${attempt} failed (${err.message}); retrying in ${backoff}ms...`);
        await sleep(backoff);
      }
    }
  }
  throw new Error(`${label} failed after ${RETRY_ATTEMPTS} attempts: ${lastErr.message}`);
}

function getSetCookies(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const raw = response.headers.get("set-cookie");
  return raw ? [raw] : [];
}

function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function stripTags(str) {
  return (str || "").replace(/<[^>]*>/g, "").trim();
}

function cleanCell(raw) {
  return decodeHtmlEntities(stripTags(raw)).trim();
}

function parseScore(raw) {
  const trimmed = (raw || "").trim();
  if (trimmed === "" || trimmed.toUpperCase() === "N/A") return null;
  const val = parseFloat(trimmed);
  return Number.isNaN(val) ? null : val;
}

function parseRatio(raw) {
  const match = /\[(\d+)\/(\d+)\]/.exec(raw || "");
  if (!match) return { responses: null, enrolled: null };
  return { responses: parseInt(match[1], 10), enrolled: parseInt(match[2], 10) };
}

const SEASON_CODE = { Fall: "FALL", Spring: "SPRG", Summer: "SUMM" };
const warnedSemesterFormats = new Set();

function parseSemester(raw) {
  const trimmed = (raw || "").trim();
  const match = /^(Fall|Spring|Summer)\s+(\d{4})$/.exec(trimmed);
  if (match) {
    const season = SEASON_CODE[match[1]];
    const year = match[2];
    return { code: `${year}${season}`, label: `${match[1]} ${year}` };
  }

  // Sub-session terms are folded into their parent term so aggregation and
  // chronological sorting treat them like the rest of that semester:
  //   "Spring 1 2023" / "Spring 2 2023"  (Woods College sessions)
  const subSession = /^(Fall|Spring|Summer)\s+\d\s+(\d{4})$/.exec(trimmed);
  if (subSession) {
    const season = SEASON_CODE[subSession[1]];
    const year = subSession[2];
    return { code: `${year}${season}`, label: `${subSession[1]} ${year}` };
  }
  //   "2024FALL1" (term code with a session suffix; rarely the suffix is
  //   other junk like a glued-on course code, so prefix-match leniently)
  const codeSession = /^(\d{4})(FALL|SPRG|SUMM)./.exec(trimmed);
  if (codeSession) {
    const seasonLabel = { FALL: "Fall", SPRG: "Spring", SUMM: "Summer" }[codeSession[2]];
    return { code: `${codeSession[1]}${codeSession[2]}`, label: `${seasonLabel} ${codeSession[1]}` };
  }

  if (!warnedSemesterFormats.has(trimmed)) {
    console.warn(`  Warning: unrecognized semester format "${trimmed}" (using raw value verbatim)`);
    warnedSemesterFormats.add(trimmed);
  }
  return { code: trimmed, label: trimmed };
}

function semesterSortKey(code) {
  const match = /^(\d{4})(FALL|SUMM|SPRG)$/.exec(code || "");
  if (!match) return -1; // unrecognized formats sort last (oldest)
  const seasonRank = { SPRG: 1, SUMM: 2, FALL: 3 };
  return parseInt(match[1], 10) * 10 + seasonRank[match[2]];
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function toScale100(n) {
  return Math.round(n * 20);
}

// ==========================================
// STEP 1: SESSION
// ==========================================

async function getSessionCookie() {
  const response = await fetch(VIEWER_URL, { headers: { "User-Agent": REQUEST_HEADERS_JSON["User-Agent"] } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const setCookies = getSetCookies(response);
  const cookiePairs = setCookies.map((c) => c.split(";")[0].trim()).filter(Boolean);
  return cookiePairs.join("; ");
}

// ==========================================
// STEP 2: RESOLVE GRID CONFIG
// ==========================================

async function getFbViewInfo(cookie) {
  const body = JSON.stringify({ strUiCulture: "", blockId: SOURCE_BLOCK_ID, userId: "", fbvType: "" });
  const response = await fetch(GET_FBVIEW_INFO_URL, {
    method: "POST",
    headers: { ...REQUEST_HEADERS_JSON, ...(cookie ? { Cookie: cookie } : {}) },
    body,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const json = await response.json();
  if (!json || typeof json.d === "undefined") {
    throw new Error("response missing json.d");
  }
  // ASMX quirk: `d` is a JSON-encoded string here, not a native object.
  const info = typeof json.d === "string" ? JSON.parse(json.d) : json.d;
  if (!info || typeof info !== "object") {
    throw new Error("could not parse getFbViewInfo config");
  }
  return info;
}

// ==========================================
// STEP 3: PAGE THROUGH THE GRID
// ==========================================

async function fetchGridPageOnce(cookie, resolvedBlockId, datasourceId, pageNum) {
  const body = JSON.stringify({
    strUiCultureIn: "",
    datasourceId: String(datasourceId),
    blockId: String(resolvedBlockId),
    subjectColId: "2",
    subjectValue: "____[-1]____",
    detailValue: "____[-1]____",
    gridId: "fbvGrid",
    pageActuelle: pageNum,
    strOrderBy: ["col_2", "asc"],
    strFilter: ["", "", "ddlFbvColumnSelectorLvl1", ""],
    sortCallbackFunc: "__getFbvGrid",
    userid: "",
    pageSize: PAGE_SIZE,
  });

  const response = await fetch(GET_FBV_GRID_URL, {
    method: "POST",
    headers: { ...REQUEST_HEADERS_JSON, ...(cookie ? { Cookie: cookie } : {}) },
    body,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  let json;
  try {
    json = await response.json();
  } catch (err) {
    throw new Error(`JSON parse failure: ${err.message}`);
  }

  const d = json && json.d;
  if (!Array.isArray(d) || d.length < 3) {
    throw new Error(`unexpected response shape for json.d (expected 7-element array, got ${JSON.stringify(d).slice(0, 120)})`);
  }

  const html = d[0] || "";
  const totalItemsMatch = /Total Items\s*([\d,]+)/i.exec(d[2] || "");
  if (!totalItemsMatch) {
    throw new Error(`could not find "Total Items" count in d[2] ("${d[2]}")`);
  }
  const totalItems = parseInt(totalItemsMatch[1].replace(/,/g, ""), 10);

  const rowCount = (html.match(/<tr class='gData'/g) || []).length;
  if (rowCount === 0) {
    throw new Error("zero gData rows in response");
  }

  return { html, totalItems };
}

function fetchGridPageWithRetry(cookie, resolvedBlockId, datasourceId, pageNum) {
  return retry(() => fetchGridPageOnce(cookie, resolvedBlockId, datasourceId, pageNum), `page ${pageNum}`);
}

// ==========================================
// PARSE GRID HTML INTO ROWS
// ==========================================

const ROW_REGEX = /<tr class='gData'[^>]*pk='([^']*)'[^>]*sk='([^']*)'[^>]*>([\s\S]*?)<\/tr>/g;
const CELL_REGEX = /<td[^>]*>([\s\S]*?)<\/td>/g;

/**
 * Parses one grid page's HTML and feeds parsed rows into `state`.
 * Mutates state.rawRowsFetched / placeholderSkipped / invalidPkSkipped /
 * malformedRowSkipped / rows.
 */
function ingestPage(html, state) {
  for (const rowMatch of html.matchAll(ROW_REGEX)) {
    const pk = rowMatch[1];
    const rowBody = rowMatch[3];
    state.rawRowsFetched++;

    if (pk === "") {
      // Page 1 always contains exactly one all-"N/A" placeholder row.
      state.placeholderSkipped++;
      continue;
    }
    // Standard pks are 10 chars (8-char course code + 2-digit section), but
    // Woods College / grad rows use variants like "ADAN722002_2025SPRING2"
    // (session-term suffix) or "EDUC610101EDUC610101" (duplicated code).
    // The leading 10 chars are still a valid course code + section, so
    // recover them instead of dropping the row.
    let normalizedPk = pk;
    if (pk.length !== 10) {
      const recovered = /^([A-Z]{4}\d{6})/.exec(pk);
      if (recovered) {
        normalizedPk = recovered[1];
        state.recoveredPk++;
      } else {
        console.warn(`  Warning: unrecognized pk format for pk='${pk}', skipping row`);
        state.invalidPkSkipped++;
        continue;
      }
    }

    const cells = [...rowBody.matchAll(CELL_REGEX)].map((m) => cleanCell(m[1]));
    if (cells.length !== 12) {
      console.warn(`  Warning: expected 12 cells, got ${cells.length} for pk='${pk}', skipping row`);
      state.malformedRowSkipped++;
      continue;
    }

    // Midterm evaluations ("Midterm Fall 2023") are a different instrument
    // from end-of-semester evaluations — including them would double-count
    // sections and skew professor averages, so they are excluded by policy.
    if (/midterm/i.test(cells[2])) {
      state.midtermExcluded++;
      continue;
    }

    const [
      ,
      name,
      semesterRaw,
      department,
      school,
      instructor,
      instructorOverallRaw,
      courseOverallRaw,
      dptInsOverallRaw,
      dptCrsOverallRaw,
      ratioRaw,
      modality,
    ] = cells;

    const semester = parseSemester(semesterRaw);
    const ratio = parseRatio(ratioRaw);

    state.rows.push({
      courseCode: normalizedPk.slice(0, 8),
      section: normalizedPk.slice(8, 10),
      name,
      department,
      school,
      instructor: instructor.trim().replace(/\s+/g, " "),
      semesterCode: semester.code,
      semesterLabel: semester.label,
      instructorOverall: parseScore(instructorOverallRaw),
      courseOverall: parseScore(courseOverallRaw),
      dptCrsOverall: parseScore(dptCrsOverallRaw),
      responses: ratio.responses,
      enrolled: ratio.enrolled,
      modality,
    });
  }
}

// ==========================================
// AGGREGATION
// ==========================================

function bumpCount(map, value) {
  if (!value) return;
  map.set(value, (map.get(value) || 0) + 1);
}

function mostFrequent(map) {
  let best = null;
  let bestCount = -1;
  for (const [val, count] of map) {
    if (count > bestCount) {
      best = val;
      bestCount = count;
    }
  }
  return best;
}

function aggregateRows(rows) {
  const courses = new Map();

  for (const row of rows) {
    let course = courses.get(row.courseCode);
    if (!course) {
      course = {
        code: row.courseCode,
        nameCounts: new Map(),
        departmentCounts: new Map(),
        schoolCounts: new Map(),
        courseOverallSum: 0,
        courseOverallCount: 0,
        dptCrsOverallSum: 0,
        dptCrsOverallCount: 0,
        responses: 0,
        enrolled: 0,
        sectionsCount: 0,
        professors: new Map(),
      };
      courses.set(row.courseCode, course);
    }

    course.sectionsCount++;
    bumpCount(course.nameCounts, row.name);
    bumpCount(course.departmentCounts, row.department);
    bumpCount(course.schoolCounts, row.school);
    if (row.courseOverall !== null) {
      course.courseOverallSum += row.courseOverall;
      course.courseOverallCount++;
    }
    if (row.dptCrsOverall !== null) {
      course.dptCrsOverallSum += row.dptCrsOverall;
      course.dptCrsOverallCount++;
    }
    if (row.responses !== null) course.responses += row.responses;
    if (row.enrolled !== null) course.enrolled += row.enrolled;

    const nameKey = row.instructor.trim().replace(/\s+/g, " ").toLowerCase();
    let prof = course.professors.get(nameKey);
    if (!prof) {
      prof = {
        name: row.instructor,
        nameKey,
        scoreOverallSum: 0,
        scoreOverallCount: 0,
        sectionsCount: 0,
        semesters: [],
      };
      course.professors.set(nameKey, prof);
    }
    prof.sectionsCount++;
    if (row.instructorOverall !== null) {
      prof.scoreOverallSum += row.instructorOverall;
      prof.scoreOverallCount++;
    }
    prof.semesters.push({
      semesterCode: row.semesterCode,
      semesterLabel: row.semesterLabel,
      instructorOverall: row.instructorOverall === null ? null : toScale100(row.instructorOverall),
      courseOverall: row.courseOverall === null ? null : toScale100(row.courseOverall),
      responses: row.responses,
      enrolled: row.enrolled,
      modality: row.modality,
    });
  }

  const result = {};
  for (const course of courses.values()) {
    const courseOverallRaw = course.courseOverallCount > 0 ? course.courseOverallSum / course.courseOverallCount : null;
    const dptCourseAvgRaw = course.dptCrsOverallCount > 0 ? course.dptCrsOverallSum / course.dptCrsOverallCount : null;

    const professors = [...course.professors.values()].map((prof) => {
      const scoreOverallRaw = prof.scoreOverallCount > 0 ? prof.scoreOverallSum / prof.scoreOverallCount : null;
      const semesters = prof.semesters
        .slice()
        .sort((a, b) => semesterSortKey(b.semesterCode) - semesterSortKey(a.semesterCode));
      return {
        name: prof.name,
        nameKey: prof.nameKey,
        scoreOverall: scoreOverallRaw === null ? null : toScale100(scoreOverallRaw),
        scoreOverallRaw: scoreOverallRaw === null ? null : round2(scoreOverallRaw),
        sectionsCount: prof.sectionsCount,
        semesters,
      };
    });

    professors.sort((a, b) => {
      const aScore = a.scoreOverall === null ? -1 : a.scoreOverall;
      const bScore = b.scoreOverall === null ? -1 : b.scoreOverall;
      if (bScore !== aScore) return bScore - aScore;
      if (b.sectionsCount !== a.sectionsCount) return b.sectionsCount - a.sectionsCount;
      return a.name.localeCompare(b.name);
    });

    result[course.code] = {
      code: course.code,
      name: mostFrequent(course.nameCounts),
      department: mostFrequent(course.departmentCounts),
      school: mostFrequent(course.schoolCounts),
      courseOverall: courseOverallRaw === null ? null : toScale100(courseOverallRaw),
      courseOverallRaw: courseOverallRaw === null ? null : round2(courseOverallRaw),
      deptCourseAvg: dptCourseAvgRaw === null ? null : toScale100(dptCourseAvgRaw),
      sectionsCount: course.sectionsCount,
      responses: course.responses,
      enrolled: course.enrolled,
      professors,
    };
  }

  return result;
}

// ==========================================
// MAIN
// ==========================================

async function main() {
  const config = parseArgs();

  console.log("\n=== BC Course Evaluation Scraper ===\n");
  console.log(`Mode: ${config.maxPages ? `SMOKE TEST (--max-pages ${config.maxPages})` : "FULL SCRAPE (all pages)"}`);

  console.log(`\nStep 1: establishing session via ${VIEWER_URL}...`);
  let cookie = "";
  try {
    cookie = await retry(() => getSessionCookie(), "session GET");
    console.log(`  Captured ${cookie ? cookie.split("; ").length : 0} cookie(s).`);
  } catch (err) {
    console.warn(`  Warning: could not establish session (${err.message}); continuing without cookies.`);
  }

  console.log("\nStep 2: resolving grid config via getFbViewInfo...");
  let info;
  try {
    info = await retry(() => getFbViewInfo(cookie), "getFbViewInfo");
  } catch (err) {
    console.error(`FATAL: could not resolve grid config: ${err.message}`);
    process.exit(1);
  }

  const resolvedBlockId = info.blockId || FALLBACK_RESOLVED_BLOCK_ID;
  const datasourceId = info.Datasource1ID || FALLBACK_DATASOURCE_ID;
  if (!info.blockId || !info.Datasource1ID) {
    console.warn(
      `  Warning: getFbViewInfo response missing expected field(s); falling back to documented defaults (blockId=${resolvedBlockId}, Datasource1ID=${datasourceId})`
    );
  }
  console.log(`  Resolved blockId=${resolvedBlockId}, Datasource1ID=${datasourceId}`);

  console.log("\nStep 3: paging through the evaluation grid...");
  const state = {
    rawRowsFetched: 0,
    placeholderSkipped: 0,
    invalidPkSkipped: 0,
    malformedRowSkipped: 0,
    recoveredPk: 0,
    midtermExcluded: 0,
    rows: [],
    pagesFetched: 0,
  };

  let page1;
  try {
    page1 = await fetchGridPageWithRetry(cookie, resolvedBlockId, datasourceId, 1);
  } catch (err) {
    console.error(`FATAL: could not fetch page 1: ${err.message}`);
    process.exit(1);
  }
  state.pagesFetched = 1;
  ingestPage(page1.html, state);
  const totalItems = page1.totalItems;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);
  console.log(`  Server reports Total Items = ${totalItems} (~${totalPages} pages @ ${PAGE_SIZE}/page)`);
  console.log(`  Page 1/${totalPages}: ${state.rawRowsFetched} raw rows so far`);

  const lastPage = config.maxPages ? Math.min(config.maxPages, totalPages) : totalPages;

  for (let page = 2; page <= lastPage; page++) {
    await sleep(PAGE_DELAY_MS);
    let result;
    try {
      result = await fetchGridPageWithRetry(cookie, resolvedBlockId, datasourceId, page);
    } catch (err) {
      console.error(`FATAL: could not fetch page ${page}: ${err.message}`);
      process.exit(1);
    }
    state.pagesFetched++;
    ingestPage(result.html, state);
    if (page % 5 === 0 || page === lastPage) {
      console.log(`  Page ${page}/${totalPages}: ${state.rawRowsFetched} raw rows so far`);
    }
  }

  const totalSkipped = state.placeholderSkipped + state.invalidPkSkipped + state.malformedRowSkipped;

  console.log("\n--- fetch stats ---");
  console.log(
    `  Pages fetched: ${state.pagesFetched}${
      config.maxPages ? ` (capped by --max-pages ${config.maxPages}; ${totalPages} available)` : ` of ${totalPages}`
    }`
  );
  console.log(`  Raw rows fetched: ${state.rawRowsFetched}`);
  console.log(`  Server-reported Total Items: ${totalItems}`);
  console.log(`  Placeholder rows skipped: ${state.placeholderSkipped}`);
  console.log(`  Invalid-pk rows skipped: ${state.invalidPkSkipped}`);
  console.log(`  Malformed rows skipped: ${state.malformedRowSkipped}`);
  console.log(`  Non-standard pks recovered: ${state.recoveredPk}`);
  console.log(`  Midterm-evaluation rows excluded: ${state.midtermExcluded}`);
  console.log(`  Total rows skipped: ${totalSkipped}`);
  console.log(`  Parsed data rows: ${state.rows.length}`);

  if (config.maxPages) {
    console.log(
      `\n--max-pages ${config.maxPages} set: skipping the row-count integrity check (only a subset of pages was fetched on purpose) and writing SMOKE-TEST output instead of the real data file.`
    );
  } else {
    console.log("\nStep 4: integrity check...");
    if (state.rawRowsFetched !== totalItems) {
      console.error(
        `FATAL: raw rows fetched (${state.rawRowsFetched}) does not match server-reported Total Items (${totalItems}). Refusing to write output file (no partial data written).`
      );
      process.exit(1);
    }
    console.log(`  OK: raw rows fetched (${state.rawRowsFetched}) matches Total Items (${totalItems}).`);
  }

  console.log("\nStep 5: aggregating by course/professor...");
  const courses = aggregateRows(state.rows);
  const courseCount = Object.keys(courses).length;
  const professorEntryCount = Object.values(courses).reduce((sum, c) => sum + c.professors.length, 0);

  const output = {
    generatedAt: new Date().toISOString(),
    sourceBlockId: SOURCE_BLOCK_ID,
    totalRowsFetched: state.rawRowsFetched,
    rowsSkipped: totalSkipped,
    midtermRowsExcluded: state.midtermExcluded,
    recoveredPkRows: state.recoveredPk,
    scaleNote: "Scores are converted from BC's 1-5 course-evaluation scale to a 0-100 scale (raw x 20).",
    courseCount,
    courses,
  };

  const outputPath = config.maxPages ? SMOKE_TEST_OUTPUT_PATH : OUTPUT_PATH;
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const json = JSON.stringify(output);
  // Atomic write: never leave a truncated data file for the live site if
  // the process dies mid-write.
  const tmpPath = `${outputPath}.tmp`;
  fs.writeFileSync(tmpPath, json);
  fs.renameSync(tmpPath, outputPath);
  const sizeMB = fs.statSync(outputPath).size / (1024 * 1024);

  console.log("\n--- aggregation stats ---");
  console.log(`  Distinct courses: ${courseCount}`);
  console.log(`  Distinct professor entries (per-course): ${professorEntryCount}`);
  console.log(`  Output file: ${outputPath}`);
  console.log(`  Output size: ${sizeMB.toFixed(2)} MB`);

  if (config.maxPages) {
    console.log("\n--- sample parsed courses ---");
    const sampleCodes = Object.keys(courses).slice(0, 3);
    for (const code of sampleCodes) {
      console.log(JSON.stringify(courses[code], null, 2));
    }
  }

  console.log("\nDone!\n");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
