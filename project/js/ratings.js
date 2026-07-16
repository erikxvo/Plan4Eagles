/* ==========================
   RATINGS PAGE - Plan4Eagles
   Depends on storage.js + ui.js + ratings-data.js
   (all loaded first).
   ========================== */

// ==========================
// STATE
// ==========================

let catalogCourses = [];
let catalogMeta = { generatedAt: null, terms: [], departments: {} };
let evaluationsData = null; // return value of loadEvaluationsData(); may stay null
let ratingsIndex = []; // union of catalog + evaluation courses, keyed by code
let selectedCode = null;

// Cap on how many list items are rendered at once (full catalog is ~4,000)
const MAX_RENDERED_RATINGS = 300;

// ==========================
// UNION INDEX
// ==========================

function emptyRatingsEntry(code) {
  return {
    code,
    name: "",
    deptCode: code.replace(/[0-9]/g, ""),
    deptName: "",
    inCatalog: false,
    hasEval: false,
    courseOverall: null,
    _catalogProfessors: new Set(),
    _evalProfessorNames: new Set(),
    _evalDeptName: null,
  };
}

/**
 * Builds ratingsIndex: one entry per distinct 8-char course code found in
 * either the course catalog or the evaluations data (a full union, so
 * courses no longer offered still show up if they have ratings, and
 * currently-offered courses still show up before ratings exist for them).
 */
function buildRatingsIndex() {
  const byCode = new Map();

  catalogCourses.forEach((course) => {
    if (!course || !course.code) return;
    let entry = byCode.get(course.code);
    if (!entry) {
      entry = emptyRatingsEntry(course.code);
      byCode.set(course.code, entry);
    }
    entry.inCatalog = true;
    if (!entry.name && course.name) entry.name = course.name;
    if (course.professor) entry._catalogProfessors.add(course.professor);
  });

  if (evaluationsData && evaluationsData.courses) {
    Object.keys(evaluationsData.courses).forEach((code) => {
      const evalEntry = evaluationsData.courses[code];
      let entry = byCode.get(code);
      if (!entry) {
        entry = emptyRatingsEntry(code);
        byCode.set(code, entry);
      }
      entry.hasEval = true;
      entry.courseOverall = evalEntry.courseOverall ?? null;
      if (!entry.name && evalEntry.name) entry.name = evalEntry.name;
      entry._evalDeptName = evalEntry.department || null;
      (evalEntry.professors || []).forEach((p) => {
        if (p && p.name) entry._evalProfessorNames.add(p.name);
      });
    });
  }

  ratingsIndex = Array.from(byCode.values()).map((entry) => {
    entry.deptName =
      catalogMeta.departments[entry.deptCode] || entry._evalDeptName || entry.deptCode;

    const spacedCode = entry.code.replace(/(\D)(\d)/, "$1 $2");
    entry.searchHaystack = [
      entry.code,
      spacedCode,
      entry.name,
      ...entry._evalProfessorNames,
      ...entry._catalogProfessors,
    ]
      .join(" ")
      .toLowerCase();

    return entry;
  });
}

// ==========================
// FRESHNESS / COVERAGE
// ==========================

function termLabelForCatalog(termCode) {
  const term = catalogMeta.terms.find((t) => t.code === termCode);
  return term ? term.label : termCode;
}

/** Chronological sort key for a "YYYYFALL"/"YYYYSPRG"/"YYYYSUMM" code. */
function semesterSortKey(semesterCode) {
  const match = /^(\d{4})(FALL|SPRG|SUMM)$/.exec(semesterCode || "");
  if (!match) return null;
  const seasonOrder = { SPRG: 0, SUMM: 1, FALL: 2 };
  return parseInt(match[1]) * 10 + seasonOrder[match[2]];
}

/** Scans every professor-semester in the evaluations data for the oldest
 *  and newest semester covered, e.g. "Fall 2021 – Fall 2025". */
function computeSemesterCoverage() {
  if (!evaluationsData || !evaluationsData.courses) return "";

  let minKey = null;
  let maxKey = null;
  let minLabel = null;
  let maxLabel = null;

  Object.values(evaluationsData.courses).forEach((courseEval) => {
    (courseEval.professors || []).forEach((professor) => {
      (professor.semesters || []).forEach((sem) => {
        const key = semesterSortKey(sem.semesterCode);
        if (key === null) return;
        if (minKey === null || key < minKey) {
          minKey = key;
          minLabel = sem.semesterLabel;
        }
        if (maxKey === null || key > maxKey) {
          maxKey = key;
          maxLabel = sem.semesterLabel;
        }
      });
    });
  });

  if (!minLabel || !maxLabel) return "";
  return minLabel === maxLabel ? minLabel : `${minLabel} – ${maxLabel}`;
}

function renderRatingsFreshness() {
  const el = document.getElementById("ratings-freshness");
  if (!el) return;

  const parts = [];
  if (evaluationsData && evaluationsData.generatedAt) {
    const date = new Date(evaluationsData.generatedAt);
    if (!isNaN(date)) {
      parts.push(
        `Ratings refreshed ${date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}`
      );
    }
  }

  const coverage = computeSemesterCoverage();
  if (coverage) parts.push(coverage);

  el.textContent = parts.join(" — ");
}

// ==========================
// DEPARTMENT FILTER
// ==========================

function populateRatingsDeptFilter() {
  const deptFilter = document.getElementById("ratings-dept-filter");
  if (!deptFilter) return;

  const depts = new Map();
  ratingsIndex.forEach((entry) => {
    if (!depts.has(entry.deptCode)) {
      depts.set(entry.deptCode, entry.deptName || entry.deptCode);
    }
  });

  const sorted = Array.from(depts.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  sorted.forEach(([code, name]) => {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = name === code ? code : `${code} – ${name}`;
    deptFilter.appendChild(option);
  });

  deptFilter.addEventListener("change", renderRatingsList);
}

// ==========================
// LIST RENDERING
// ==========================

function ratingsEntryMatchesFilters(entry, searchTerm, dept) {
  if (dept && entry.deptCode !== dept) return false;
  if (searchTerm && !entry.searchHaystack.includes(searchTerm)) return false;
  return true;
}

function renderRatingsList() {
  const list = document.getElementById("ratings-course-list");
  const resultsCount = document.getElementById("ratings-results-count");
  if (!list) return;

  const searchBox = document.getElementById("ratings-search-box");
  const deptFilter = document.getElementById("ratings-dept-filter");
  const searchTerm = searchBox ? searchBox.value.trim().toLowerCase() : "";
  const dept = deptFilter ? deptFilter.value : "";

  const matches = ratingsIndex
    .filter((entry) => ratingsEntryMatchesFilters(entry, searchTerm, dept))
    .sort((a, b) => a.code.localeCompare(b.code));

  if (resultsCount) {
    if (matches.length > MAX_RENDERED_RATINGS) {
      resultsCount.textContent = `${matches.length.toLocaleString()} courses match — showing the first ${MAX_RENDERED_RATINGS}. Narrow your search to see the rest.`;
    } else {
      resultsCount.textContent = `${matches.length.toLocaleString()} course${matches.length === 1 ? "" : "s"} match`;
    }
  }

  list.innerHTML = "";

  if (matches.length === 0) {
    const li = document.createElement("li");
    li.className = "course-list-message";
    li.textContent =
      ratingsIndex.length === 0
        ? "No course or ratings data is available yet."
        : "No courses match your filters. Try a different search term or department.";
    list.appendChild(li);
    return;
  }

  matches.slice(0, MAX_RENDERED_RATINGS).forEach((entry) => {
    list.appendChild(buildRatingsListItem(entry));
  });
}

function buildInlineScoreBadge(score) {
  const badge = document.createElement("span");
  badge.className = `ratings-score-badge ratings-score-${scoreBand(score)} ratings-inline-score`;
  badge.textContent = `${score}/100`;
  return badge;
}

function buildRatingsListItem(entry) {
  const li = document.createElement("li");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "course-item ratings-list-item";
  btn.dataset.code = entry.code;
  btn.setAttribute(
    "aria-label",
    `View ratings for ${entry.code}, ${entry.name || entry.code}`
  );

  const topRow = document.createElement("span");
  topRow.className = "course-item-top";
  const codeEl = document.createElement("strong");
  codeEl.textContent = entry.code;
  topRow.appendChild(codeEl);
  // A course can have eval rows whose overall score BC suppressed —
  // only show a numeric badge when a real score exists.
  if (entry.hasEval && typeof entry.courseOverall === "number") {
    topRow.appendChild(buildInlineScoreBadge(entry.courseOverall));
  }
  btn.appendChild(topRow);

  const nameEl = document.createElement("span");
  nameEl.className = "course-item-name";
  nameEl.textContent = entry.name || "Untitled course";
  btn.appendChild(nameEl);

  const tagsRow = document.createElement("span");
  tagsRow.className = "ratings-list-tags";
  if (!entry.hasEval) {
    const tag = document.createElement("span");
    tag.className = "ratings-tag-noeval";
    tag.textContent = "Not yet evaluated";
    tagsRow.appendChild(tag);
  }
  if (!entry.inCatalog) {
    const tag = document.createElement("span");
    tag.className = "ratings-tag-historical";
    tag.textContent = "No longer offered";
    tagsRow.appendChild(tag);
  }
  if (tagsRow.children.length > 0) btn.appendChild(tagsRow);

  if (entry.code === selectedCode) btn.classList.add("is-selected");

  btn.addEventListener("click", () => selectCourse(entry.code));

  li.appendChild(btn);
  return li;
}

/** Refresh the "selected" mark on currently rendered list items */
function updateSelectedListItem(code) {
  document.querySelectorAll("#ratings-course-list .ratings-list-item").forEach((btn) => {
    btn.classList.toggle("is-selected", btn.dataset.code === code);
  });
}

// ==========================
// COURSE SELECTION / DETAIL
// ==========================

/** Sections (from the live catalog) for a course code, deduped by professor+semester. */
function catalogSectionsFor(code) {
  const seen = new Map();
  catalogCourses.forEach((course) => {
    if (!course || course.code !== code) return;
    const key = `${course.professor}__${course.semester}`;
    if (!seen.has(key)) {
      seen.set(key, {
        professor: course.professor,
        semester: course.semester,
        semesterLabel: termLabelForCatalog(course.semester),
      });
    }
  });
  return Array.from(seen.values());
}

function selectCourse(code) {
  selectedCode = code;

  // Reflect the selection in the URL (no new history entry)
  const url = new URL(window.location.href);
  url.searchParams.set("course", code);
  history.replaceState(null, "", url);

  const entry = ratingsIndex.find((e) => e.code === code);

  const detailPanel = document.getElementById("ratings-detail-panel");
  renderCourseRatingsInto(detailPanel, code, {
    courseName: entry ? entry.name : "",
    showSchedulingLink: !!(entry && entry.inCatalog),
    catalogSections: catalogSectionsFor(code),
  });

  updateSelectedListItem(code);
}

// ==========================
// INITIALIZATION
// ==========================

document.addEventListener("DOMContentLoaded", async () => {
  const catalogPromise = fetch("project/data/courses.json")
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .catch((error) => {
      console.error("Error loading course catalog:", error);
      return null;
    });

  const [catalogJson, evalJson] = await Promise.all([
    catalogPromise,
    loadEvaluationsData(),
  ]);

  if (catalogJson) {
    catalogCourses = Array.isArray(catalogJson.courses) ? catalogJson.courses : [];
    catalogMeta = {
      generatedAt: catalogJson.generatedAt || null,
      terms: Array.isArray(catalogJson.terms) ? catalogJson.terms : [],
      departments: catalogJson.departments || {},
    };
  }
  evaluationsData = evalJson;

  if (!evaluationsData) {
    showToast("Ratings data unavailable", { type: "error" });
  }

  buildRatingsIndex();
  renderRatingsFreshness();
  populateRatingsDeptFilter();
  renderRatingsList();

  // Search input (debounced re-render)
  const searchBox = document.getElementById("ratings-search-box");
  if (searchBox) {
    let debounceTimer = null;
    searchBox.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(renderRatingsList, 150);
    });
  }

  // Deep link support: ?course=CODE prefills search and opens the detail
  const params = new URLSearchParams(window.location.search);
  const codeParam = params.get("course");
  if (codeParam) {
    const code = codeParam.toUpperCase();
    if (searchBox) searchBox.value = code;
    renderRatingsList();
    selectCourse(code);
  }
});
