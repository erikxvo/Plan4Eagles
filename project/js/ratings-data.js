/* ============================================
   SHARED RATINGS HELPERS - Plan4Eagles
   Loaded before page scripts that use them
   (ratings.html and scheduling.html). Pure data
   + rendering helpers — no DOMContentLoaded, no
   page-specific state.
   ============================================ */

// Module-level cache: the parsed evaluations.json, or null once we know
// the fetch failed. Populated once by loadEvaluationsData().
let _evaluationsData = null;
let _evaluationsLoadPromise = null;

/**
 * Fetches project/data/evaluations.json and caches the parsed result.
 * Never throws — on any failure (404, network error, bad JSON) this
 * logs to the console and resolves to null so callers can degrade
 * gracefully instead of crashing the page.
 */
async function loadEvaluationsData() {
  if (_evaluationsData !== null) return _evaluationsData;
  if (_evaluationsLoadPromise) return _evaluationsLoadPromise;

  _evaluationsLoadPromise = (async () => {
    try {
      const response = await fetch("project/data/evaluations.json");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      _evaluationsData = json;
      return _evaluationsData;
    } catch (error) {
      console.error("Error loading evaluations data:", error);
      return null;
    }
  })();

  const result = await _evaluationsLoadPromise;
  _evaluationsLoadPromise = null;
  return result;
}

/**
 * Returns the courses[code] entry from the cached evaluations data, or
 * null when the data hasn't loaded or the course has no eval entry.
 * Requires loadEvaluationsData() to have already resolved.
 */
function getCourseEval(code) {
  if (!_evaluationsData || !_evaluationsData.courses) return null;
  return _evaluationsData.courses[code] || null;
}

/**
 * Buckets a 0-100 score into a display band. Maps 1:1 to the
 * ratings-score-{band} CSS classes in ratings.css. BC suppresses overall
 * scores for some low-response sections, so a missing score is a real,
 * reachable case — it must read as "no data", never as a low rating.
 */
function scoreBand(score0to100) {
  if (typeof score0to100 !== "number" || !isFinite(score0to100)) return "none";
  if (score0to100 >= 85) return "great";
  if (score0to100 >= 70) return "good";
  if (score0to100 >= 55) return "mid";
  return "low";
}

/**
 * Normalizes a name string for surname matching: strips a leading
 * "Prof. " title, lowercases, turns hyphens into spaces, and collapses
 * repeated whitespace.
 */
function _normalizeNameForMatch(str) {
  return String(str || "")
    .replace(/^prof\.\s*/i, "")
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'") // unify curly/modifier apostrophes
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Matches a catalog professor string (e.g. "Prof. Mcelwaine",
 * "Prof. Sellers-Garcia", "Staff") to a professor entry within a single
 * course's evaluation data. Matching is course-scoped — never global —
 * because surnames alone are not unique across the whole catalog.
 *
 * Returns one of:
 *   { match: null, reason: "staff" }
 *   { match: null, reason: "no-eval-data-for-course" }
 *   { match: null, reason: "no-match" }
 *   { match: professorObj, confidence: "exact" }
 *   { match: null, matches: professorObj[], confidence: "ambiguous" }
 */
function matchProfessorToSection(catalogProfessorString, courseEvalEntry) {
  if (!catalogProfessorString || catalogProfessorString.trim() === "Staff") {
    return { match: null, reason: "staff" };
  }

  const lastNameKey = _normalizeNameForMatch(catalogProfessorString);

  if (!courseEvalEntry || !Array.isArray(courseEvalEntry.professors)) {
    return { match: null, reason: "no-eval-data-for-course" };
  }

  const matches = [];
  courseEvalEntry.professors.forEach((professor) => {
    const tokens = _normalizeNameForMatch(professor.name).split(" ").filter(Boolean);
    if (tokens.length === 0) return;

    // Candidate surnames: trailing suffixes of 1..3 tokens, longest first,
    // each only counted when it's shorter than the full token list — a
    // literal single-token name may still match on its own whole value.
    const candidates = [];
    const maxLen = Math.min(3, tokens.length);
    for (let len = maxLen; len >= 1; len--) {
      if (len < tokens.length || tokens.length === 1) {
        candidates.push(tokens.slice(tokens.length - len).join(" "));
      }
    }

    if (candidates.includes(lastNameKey)) {
      matches.push(professor);
    }
  });

  if (matches.length === 0) return { match: null, reason: "no-match" };
  if (matches.length === 1) return { match: matches[0], confidence: "exact" };
  return { match: null, matches, confidence: "ambiguous" };
}

/**
 * Renders a course's rating detail (header + professor list) into
 * containerEl. Awaits loadEvaluationsData() internally, so it's safe to
 * call directly from a click handler before the cache is warm.
 *
 * opts:
 *   courseName          fallback display title when no eval entry exists
 *   catalogSections      [{ professor, semester, semesterLabel }, ...]
 *   currentProfessorString  the professor string for the section the
 *                           user is currently looking at (highlights it)
 *   showSchedulingLink   boolean — append a link to scheduling.html
 */
async function renderCourseRatingsInto(containerEl, courseCode, opts = {}) {
  if (!containerEl) return;

  // Staleness guard: if a second render starts on this container while the
  // first data fetch is still in flight, the first must not clobber it.
  const renderToken = (Number(containerEl.dataset.renderToken) || 0) + 1;
  containerEl.dataset.renderToken = String(renderToken);

  containerEl.innerHTML = "";
  const loadingEl = document.createElement("p");
  loadingEl.className = "hint-text ratings-loading";
  loadingEl.textContent = "Loading ratings…";
  containerEl.appendChild(loadingEl);

  const data = await loadEvaluationsData();
  if (containerEl.dataset.renderToken !== String(renderToken)) return;

  containerEl.innerHTML = "";

  if (data === null) {
    const errorEl = document.createElement("p");
    errorEl.className = "hint-text ratings-empty-state";
    errorEl.textContent =
      "Ratings data couldn't be loaded right now. Try refreshing the page.";
    containerEl.appendChild(errorEl);
    return;
  }

  const courseEval = getCourseEval(courseCode);

  if (!courseEval) {
    const heading = document.createElement("h2");
    heading.className = "ratings-detail-heading";
    heading.textContent = opts.courseName
      ? `${courseCode} — ${opts.courseName}`
      : courseCode;
    containerEl.appendChild(heading);

    const emptyEl = document.createElement("p");
    emptyEl.className = "hint-text ratings-empty-state";
    emptyEl.textContent = "No evaluation data is available yet for this course.";
    containerEl.appendChild(emptyEl);

    if (opts.showSchedulingLink) {
      containerEl.appendChild(_buildSchedulingLink(courseCode));
    }
    return;
  }

  containerEl.appendChild(_buildCourseHeader(courseEval));
  containerEl.appendChild(_buildProfessorSection(courseEval, opts));

  if (opts.showSchedulingLink) {
    containerEl.appendChild(_buildSchedulingLink(courseCode));
  }
}

/** Builds the course-level header: name, big score badge, coverage hints. */
function _buildCourseHeader(courseEval) {
  const header = document.createElement("div");
  header.className = "ratings-course-header";

  const titleRow = document.createElement("div");
  titleRow.className = "ratings-course-title-row";

  const titleEl = document.createElement("h2");
  titleEl.className = "ratings-detail-heading";
  titleEl.textContent = courseEval.name
    ? `${courseEval.code} — ${courseEval.name}`
    : courseEval.code;
  titleRow.appendChild(titleEl);

  titleRow.appendChild(
    _buildScoreBadge(courseEval.courseOverall, "ratings-score-badge-lg")
  );
  header.appendChild(titleRow);

  const evaluatedSections = Array.isArray(courseEval.professors)
    ? courseEval.professors.reduce((sum, p) => sum + (p.sectionsCount || 0), 0)
    : courseEval.sectionsCount || 0;

  const hint = document.createElement("p");
  hint.className = "hint-text";
  hint.textContent =
    `Course rating averaged across ${evaluatedSections} evaluated section${evaluatedSections === 1 ? "" : "s"} · ` +
    `${courseEval.responses ?? 0} of ${courseEval.enrolled ?? 0} students responded`;
  header.appendChild(hint);

  const coverage = document.createElement("p");
  coverage.className = "hint-text ratings-coverage-line";
  const newestLabel = _newestSemesterLabel(courseEval);
  const coverageParts = [];
  if (newestLabel) coverageParts.push(`Most recent data: ${newestLabel}`);
  coverageParts.push("Converted from BC's 1-5 evaluation scale (score x 20)");
  coverage.textContent = coverageParts.join(" · ");
  header.appendChild(coverage);

  return header;
}

/**
 * Chronological sort key for a "YYYYFALL"/"YYYYSPRG"/"YYYYSUMM" code, or
 * null for unrecognized codes. Plain string comparison would order terms
 * within a year alphabetically (FALL < SPRG < SUMM), which is wrong.
 */
function _semesterSortKey(semesterCode) {
  const match = /^(\d{4})(FALL|SPRG|SUMM)$/.exec(semesterCode || "");
  if (!match) return null;
  const seasonOrder = { SPRG: 0, SUMM: 1, FALL: 2 };
  return parseInt(match[1]) * 10 + seasonOrder[match[2]];
}

/** Finds the newest semesterLabel across all professors/semesters for a course. */
function _newestSemesterLabel(courseEval) {
  let newestKey = null;
  let newestLabel = null;
  (courseEval.professors || []).forEach((professor) => {
    (professor.semesters || []).forEach((sem) => {
      const key = _semesterSortKey(sem.semesterCode);
      if (key === null) return;
      if (newestKey === null || key > newestKey) {
        newestKey = key;
        newestLabel = sem.semesterLabel;
      }
    });
  });
  return newestLabel;
}

/** Builds the "Professors who teach CODE" ranked list. */
function _buildProfessorSection(courseEval, opts) {
  const wrapper = document.createElement("div");
  wrapper.className = "ratings-professor-section";

  const heading = document.createElement("h3");
  heading.textContent = `Professors who teach ${courseEval.code}`;
  wrapper.appendChild(heading);

  const list = document.createElement("ol");
  list.className = "ratings-professor-list";

  const professors = Array.isArray(courseEval.professors) ? courseEval.professors : [];
  const catalogSections = Array.isArray(opts.catalogSections) ? opts.catalogSections : [];

  professors.forEach((professor, index) => {
    list.appendChild(
      _buildProfessorItem(professor, index, courseEval, catalogSections, opts.currentProfessorString)
    );
  });

  wrapper.appendChild(list);

  // Note when the current professor has no rating data at all — or when
  // several rated professors share the surname and can't be told apart
  // (never claim "no data" when data exists but is ambiguous).
  if (
    opts.currentProfessorString &&
    opts.currentProfessorString.trim() !== "Staff"
  ) {
    const currentMatch = matchProfessorToSection(opts.currentProfessorString, courseEval);
    if (!currentMatch.match) {
      const note = document.createElement("p");
      note.className = "hint-text ratings-no-current-data";
      note.textContent =
        currentMatch.confidence === "ambiguous"
          ? `Multiple professors match ${opts.currentProfessorString} in this course — their ratings are listed separately above.`
          : `No rating data yet for ${opts.currentProfessorString} in this course.`;
      wrapper.appendChild(note);
    }
  }

  return wrapper;
}

function _buildProfessorItem(professor, index, courseEval, catalogSections, currentProfessorString) {
  const li = document.createElement("li");
  li.className = "ratings-professor-item";

  const rank = document.createElement("span");
  rank.className = "ratings-professor-rank";
  rank.textContent = String(index + 1);
  li.appendChild(rank);

  const info = document.createElement("span");
  info.className = "ratings-professor-info";

  const nameEl = document.createElement("span");
  nameEl.className = "ratings-professor-name";
  nameEl.textContent = professor.name;
  info.appendChild(nameEl);

  const semesters = Array.isArray(professor.semesters) ? professor.semesters : [];
  const oldestLabel = semesters.length > 0 ? semesters[semesters.length - 1].semesterLabel : null;
  const newestLabel = semesters.length > 0 ? semesters[0].semesterLabel : null;

  const hint = document.createElement("span");
  hint.className = "hint-text ratings-professor-hint";
  const sectionsCount = professor.sectionsCount || semesters.length || 0;
  let rangeText = "";
  if (oldestLabel && newestLabel) {
    rangeText = oldestLabel === newestLabel ? oldestLabel : `${oldestLabel} – ${newestLabel}`;
  }
  hint.textContent =
    `${sectionsCount} section${sectionsCount === 1 ? "" : "s"} rated` +
    (rangeText ? ` · ${rangeText}` : "");
  info.appendChild(hint);

  // "Teaching <semesterLabel>" badge when a catalog section resolves (via
  // matchProfessorToSection) to this same professor. Prefer the most
  // recent term when they teach it in several.
  const teachingSection = catalogSections
    .filter((section) => matchProfessorToSection(section.professor, courseEval).match === professor)
    .sort((a, b) => (_semesterSortKey(b.semester) ?? -1) - (_semesterSortKey(a.semester) ?? -1))[0];
  if (teachingSection) {
    const teachingBadge = document.createElement("span");
    teachingBadge.className = "ratings-current-badge";
    teachingBadge.textContent = `Teaching ${teachingSection.semesterLabel}`;
    teachingBadge.title = "Matched to the course catalog by last name within this course";
    info.appendChild(teachingBadge);
  }

  li.appendChild(info);
  li.appendChild(_buildScoreBadge(professor.scoreOverall, "ratings-score-badge-sm"));

  // Highlight when this professor matches the section currently being viewed
  if (currentProfessorString && currentProfessorString.trim() !== "Staff") {
    const currentMatch = matchProfessorToSection(currentProfessorString, courseEval);
    if (currentMatch.match === professor) {
      li.classList.add("is-current");
    }
  }

  return li;
}

/** Builds a score badge span with the right band class + size modifier. */
function _buildScoreBadge(score, sizeClass) {
  const badge = document.createElement("span");
  badge.className = `ratings-score-badge ratings-score-${scoreBand(score)} ${sizeClass}`;

  if (typeof score !== "number" || !isFinite(score)) {
    // Score suppressed/unreported by BC — show that, not a fake low score.
    const noneEl = document.createElement("small");
    noneEl.textContent = "No score";
    badge.appendChild(noneEl);
    return badge;
  }

  const scoreEl = document.createElement("strong");
  scoreEl.textContent = String(score);
  badge.appendChild(scoreEl);

  const suffixEl = document.createElement("small");
  suffixEl.textContent = "/100";
  badge.appendChild(suffixEl);

  return badge;
}

/** Builds the "View sections in Scheduling ->" link. */
function _buildSchedulingLink(courseCode) {
  const link = document.createElement("a");
  link.className = "ratings-scheduling-link";
  link.href = `scheduling.html?search=${encodeURIComponent(courseCode)}`;
  link.textContent = "View sections in Scheduling →";
  return link;
}
