/* ==========================
   SCHEDULING PAGE - Plan4Eagles
   Depends on storage.js + ui.js (loaded first).
   ========================== */

// ==========================
// COLOR GENERATION
// ==========================

let colorIndex = 0;
const courseColors = new Map();

function getCourseColor(uniqueId) {
  if (courseColors.has(uniqueId)) {
    return courseColors.get(uniqueId);
  }

  const colors = [
    { bg: "#ffe8cc", border: "#d4a66f" },
    { bg: "#ffd4d4", border: "#d48a8a" },
    { bg: "#d4f0ff", border: "#7ab8d4" },
    { bg: "#e8d4ff", border: "#b88ad4" },
    { bg: "#d4ffe8", border: "#7ad4a6" },
    { bg: "#ffe8f0", border: "#d4a6b8" },
    { bg: "#fff3d0", border: "#d4bd7a" },
    { bg: "#ffeedd", border: "#d4b88a" },
    { bg: "#e8f0ff", border: "#a6b8d4" },
  ];

  const color = colors[colorIndex % colors.length];
  courseColors.set(uniqueId, color);
  colorIndex++;

  return color;
}

// ==========================
// STATE
// ==========================

let courseData = [];
let dataMeta = { generatedAt: null, terms: [], departments: {} };
const scheduledCourses = new Set();
const scheduledCourseIndices = new Map(); // uniqueId -> courseData index

// "CODE-TERM" -> array of courseData indices sharing that course+term
// family (lecture + discussion sections of the same course/semester).
// Rebuilt whenever courseData is (re)loaded.
let courseFamilies = new Map();

// Cap on how many list items are rendered at once (full catalog is ~4,000)
const MAX_RENDERED_COURSES = 300;

// ==========================
// COURSE HELPERS
// ==========================

function uniqueIdFor(course) {
  return `${course.code}-${course.section}-${course.semester}`;
}

/** True when the course has fixed weekday meetings that fit the Mon-Fri grid */
function isPlaceable(course) {
  if (!course.startTime || !course.endTime) return false;
  if (!Array.isArray(course.days) || course.days.length === 0) return false;
  if (course.scheduleType && course.scheduleType !== "scheduled") return false;
  return true;
}

function scheduleTypeLabel(course) {
  switch (course.scheduleType) {
    case "async":
      return "Online asynchronous";
    case "arranged":
      return "By arrangement";
    case "tba":
      return "Schedule TBA";
    case "weekend":
      return "Meets on weekends";
    default:
      return "";
  }
}

/** "T" is Tuesday in our data format; show it as "Tu" */
function displayDays(days) {
  return (days || []).map((d) => (d === "T" ? "Tu" : d)).join("");
}

function courseTimeText(course) {
  if (isPlaceable(course) || course.scheduleType === "weekend") {
    return `${displayDays(course.days)} ${formatTime(course.startTime)}–${formatTime(course.endTime)}`;
  }
  return scheduleTypeLabel(course) || "No meeting time listed";
}

function termLabelFor(termCode) {
  const term = dataMeta.terms.find((t) => t.code === termCode);
  return term ? term.label : termCode;
}

// ==========================
// COMPONENT / PAIRING HELPERS (lecture/discussion)
// ==========================

/**
 * "lecture" | "discussion" | null, tolerating old-schema/archived data
 * where course.component may be missing entirely.
 */
function componentOf(course) {
  return course && (course.component === "lecture" || course.component === "discussion")
    ? course.component
    : null;
}

function familyKeyFor(course) {
  return `${course.code}-${course.semester}`;
}

/** Rebuilds the course+term family index; call whenever courseData changes. */
function buildCourseFamilies() {
  courseFamilies = new Map();
  courseData.forEach((course, index) => {
    const key = familyKeyFor(course);
    if (!courseFamilies.has(key)) courseFamilies.set(key, []);
    courseFamilies.get(key).push(index);
  });
}

/** All catalog sections sharing this course's code + term (incl. itself). */
function familySections(course) {
  const indices = courseFamilies.get(familyKeyFor(course));
  return indices ? indices.map((i) => courseData[i]).filter(Boolean) : [course];
}

/** Currently-scheduled sections with a given code, optionally filtered to one component. */
function scheduledSectionsOfCourse(code, component) {
  const results = [];
  scheduledCourseIndices.forEach((index) => {
    const c = courseData[index];
    if (!c || c.code !== code) return;
    if (component !== undefined && componentOf(c) !== component) return;
    results.push(c);
  });
  return results;
}

/**
 * Discussion sections in `course`'s family that belong under this lecture's
 * menu: unrestricted (pairsWith null/empty — "any lecture") or explicitly
 * paired with this lecture's section. Sorted by section. Returns
 * { index, course } pairs so callers can address the courseData entry
 * directly without re-searching for it.
 */
function discussionsForLecture(course) {
  const indices = courseFamilies.get(familyKeyFor(course)) || [];
  const entries = indices
    .map((index) => ({ index, course: courseData[index] }))
    .filter(({ course: c }) => c && componentOf(c) === "discussion")
    .filter(({ course: c }) => {
      const pairsWith = Array.isArray(c.pairsWith) ? c.pairsWith : null;
      return !pairsWith || pairsWith.length === 0 || pairsWith.includes(course.section);
    });
  entries.sort((a, b) =>
    a.course.section.localeCompare(b.course.section, undefined, { numeric: true })
  );
  return entries;
}

// ==========================
// DYNAMIC GRID RANGE
// ==========================

const SLOT_HEIGHT = 45; // pixels per 30-minute slot
const BASE_START_HOUR = 8; // baseline visible range: 8:00 AM …
const BASE_END_HOUR = 20; // … to 8:00 PM

let gridStartHour = BASE_START_HOUR;
let gridEndHour = BASE_END_HOUR;

/**
 * The grid always shows at least the 8 AM - 8 PM baseline and expands
 * (rounded outward to the hour) when a *scheduled* class starts earlier
 * or ends later, so no block is ever rendered outside the container.
 */
function computeGridRange() {
  let earliestMinutes = BASE_START_HOUR * 60;
  let latestMinutes = BASE_END_HOUR * 60;

  scheduledCourseIndices.forEach((index) => {
    const course = courseData[index];
    if (!course || !course.startTime || !course.endTime) return;
    const [sh, sm] = course.startTime.split(":").map(Number);
    const [eh, em] = course.endTime.split(":").map(Number);
    if ([sh, sm, eh, em].some(Number.isNaN)) return;
    const startTotal = sh * 60 + sm;
    const endTotal = eh * 60 + em;

    if (startTotal < earliestMinutes) earliestMinutes = startTotal;
    if (endTotal > latestMinutes) latestMinutes = endTotal;
  });

  gridStartHour = Math.floor(earliestMinutes / 60);
  gridEndHour = Math.ceil(latestMinutes / 60);

  if (gridEndHour <= gridStartHour) {
    gridEndHour = gridStartHour + 1;
  }
}

/**
 * Re-renders every scheduled course block. Called whenever the grid range
 * may have changed (add/remove/load/clear) so block positions always use
 * the current gridStartHour scale.
 */
function renderAllBlocks() {
  document.querySelectorAll(".course-block").forEach((block) => block.remove());

  const daySlots = document.querySelectorAll(".day-slots");
  scheduledCourseIndices.forEach((index, uniqueId) => {
    const course = courseData[index];
    if (!course || !isPlaceable(course)) return;
    course.days.forEach((day) => {
      const daySlot = Array.from(daySlots).find(
        (slot) => slot.dataset.day === day
      );
      if (daySlot) {
        daySlot.appendChild(createCourseBlock(course, uniqueId));
      }
    });
  });
}

/** Recomputes the time range, rebuilds the time column, re-places blocks. */
function refreshGrid() {
  computeGridRange();
  buildTimeGrid();
  renderAllBlocks();
}

/** Scrolls the calendar so the named course's block is visible. */
function scrollBlockIntoView(uniqueId) {
  const wrapper = document.querySelector(".schedule-grid-scroll");
  if (!wrapper) return;
  const block = wrapper.querySelector(
    `.course-block[data-unique-id="${uniqueId}"]`
  );
  if (!block) return;

  const HEADER_HEIGHT = 50; // sticky day-header row
  const blockTop = HEADER_HEIGHT + block.offsetTop;
  const blockBottom = blockTop + block.offsetHeight;
  const viewTop = wrapper.scrollTop + HEADER_HEIGHT;
  const viewBottom = wrapper.scrollTop + wrapper.clientHeight;

  if (blockTop < viewTop || blockBottom > viewBottom) {
    wrapper.scrollTo({
      top: Math.max(0, blockTop - HEADER_HEIGHT - 12),
      behavior: "smooth",
    });
  }
}

/**
 * Generates time-slot labels for every 30-minute interval from
 * gridStartHour to gridEndHour. Also sets the height of all
 * .day-slots containers to match.
 */
function buildTimeGrid() {
  const timeColumn = document.getElementById("time-column");
  if (!timeColumn) return;

  // Remove any existing time-slot divs (keep the time-header)
  timeColumn.querySelectorAll(".time-slot").forEach((el) => el.remove());

  const totalSlots = (gridEndHour - gridStartHour) * 2;
  const totalHeight = totalSlots * SLOT_HEIGHT;

  // Generate a time-slot div for each 30-minute interval
  for (let i = 0; i < totalSlots; i++) {
    const totalMinutes = gridStartHour * 60 + i * 30;
    const hour = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    const slot = document.createElement("div");
    slot.classList.add("time-slot");
    slot.textContent = formatTime(
      `${hour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
    );
    timeColumn.appendChild(slot);
  }

  // Update all day-slots containers: height and background gradient
  document.querySelectorAll(".day-slots").forEach((daySlot) => {
    daySlot.style.height = `${totalHeight}px`;
    daySlot.style.background = `repeating-linear-gradient(
      to bottom,
      transparent,
      transparent ${SLOT_HEIGHT - 1}px,
      #f5f0e8 ${SLOT_HEIGHT - 1}px,
      #f5f0e8 ${SLOT_HEIGHT}px
    )`;
  });
}

// ==========================
// LOAD COURSE DATA FROM JSON
// ==========================

async function loadCourseData() {
  const courseList = document.getElementById("course-list");
  if (courseList) {
    courseList.innerHTML = '<li class="course-list-message">Loading course catalog…</li>';
  }

  try {
    const response = await fetch("project/data/courses.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();

    // Tolerate both the current wrapper format and the legacy plain array
    if (Array.isArray(json)) {
      courseData = json;
    } else {
      courseData = Array.isArray(json.courses) ? json.courses : [];
      dataMeta = {
        generatedAt: json.generatedAt || null,
        terms: Array.isArray(json.terms) ? json.terms : [],
        departments: json.departments || {},
      };
    }

    buildCourseFamilies();
    refreshGrid();
    renderFreshness();
    populateTermFilter();
    populateDeptFilter();
    renderCourseList();

    restoreSelectedSemester();
    updateExportHint();
    updateGridStatus();
  } catch (error) {
    console.error("Error loading course data:", error);
    if (courseList) {
      courseList.innerHTML =
        '<li class="course-list-message">Could not load the course catalog. Refresh the page to try again.</li>';
    }
    showToast("Could not load course data.", { type: "error" });
  }
}

function renderFreshness() {
  const el = document.getElementById("data-freshness");
  if (!el) return;
  const parts = [];
  if (dataMeta.generatedAt) {
    const date = new Date(dataMeta.generatedAt);
    if (!isNaN(date)) {
      parts.push(
        `Catalog refreshed ${date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}`
      );
    }
  }
  if (dataMeta.terms.length > 0) {
    parts.push(dataMeta.terms.map((t) => t.label).join(" · "));
  }
  el.textContent = parts.join(" — ");
}

// ==========================
// TERM FILTER (from data)
// ==========================

/** Approximate end date of a BC term, used to pick a sensible default */
function termEndDate(termCode) {
  const match = /^(\d{4})(FALL|SPRG|SUMM)$/.exec(termCode || "");
  if (!match) return null;
  const year = parseInt(match[1]);
  const monthDay = { SPRG: [4, 31], SUMM: [7, 31], FALL: [11, 31] }[match[2]];
  return new Date(year, monthDay[0], monthDay[1]);
}

function populateTermFilter() {
  const termFilter = document.getElementById("semester-data-filter");
  if (!termFilter) return;

  // Terms come from the data file; fall back to whatever appears in courses
  let terms = dataMeta.terms;
  if (terms.length === 0) {
    const codes = [...new Set(courseData.map((c) => c.semester))].filter(Boolean);
    terms = codes.map((code) => ({ code, label: code }));
  }

  terms.forEach((term) => {
    const option = document.createElement("option");
    option.value = term.code;
    option.textContent =
      term.status === "archived"
        ? `${term.label} · Archived snapshot`
        : term.label;
    termFilter.appendChild(option);
  });

  // Default to the first non-archived term that hasn't ended yet (else the latest)
  const now = new Date();
  const current = terms.find((t) => {
    if (t.status === "archived") return false;
    const end = termEndDate(t.code);
    return end && end >= now;
  });
  if (current) {
    termFilter.value = current.code;
  } else if (terms.length > 0) {
    termFilter.value = terms[terms.length - 1].code;
  }

  // A ?search= deep link (e.g. from the Ratings page) should never land on
  // a false-empty list because the default term hides the course.
  const deepLinkSearch = document.getElementById("search-box");
  if (deepLinkSearch && deepLinkSearch.value.trim()) {
    termFilter.value = "";
  }

  termFilter.addEventListener("change", renderCourseList);
  termFilter.addEventListener("change", () => renderArchiveNote(termFilter.value));
  renderArchiveNote(termFilter.value);
}

/** Show a contextual note when an archived snapshot term is selected */
function renderArchiveNote(termCode) {
  const el = document.getElementById("archive-note");
  if (!el) return;
  const term = dataMeta.terms.find((t) => t.code === termCode);
  if (term && term.status === "archived") {
    el.textContent =
      `${term.label} course data is an archived snapshot preserved for ` +
      "reference. Confirm official details through Boston College systems.";
    el.hidden = false;
  } else {
    el.textContent = "";
    el.hidden = true;
  }
}

// ==========================
// DEPARTMENT FILTER
// ==========================

function populateDeptFilter() {
  const deptFilter = document.getElementById("dept-filter");
  if (!deptFilter) return;

  const depts = new Map();
  courseData.forEach((course) => {
    const prefix = course.code.replace(/[0-9]/g, "");
    if (!depts.has(prefix)) {
      depts.set(prefix, dataMeta.departments[prefix] || prefix);
    }
  });

  const sorted = Array.from(depts.entries()).sort((a, b) =>
    a[1].localeCompare(b[1])
  );
  sorted.forEach(([code, name]) => {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = name === code ? code : `${code} – ${name}`;
    deptFilter.appendChild(option);
  });

  deptFilter.addEventListener("change", renderCourseList);
}

// ==========================
// COURSE LIST RENDERING
// ==========================

function courseMatchesFilters(course, searchTerm, dept, termCode) {
  if (dept && course.code.replace(/[0-9]/g, "") !== dept) return false;
  if (termCode && course.semester !== termCode) return false;
  if (searchTerm) {
    const haystack = `${course.code} ${course.code.replace(/(\D)(\d)/, "$1 $2")} ${course.name} ${course.professor}`.toLowerCase();
    if (!haystack.includes(searchTerm)) return false;
  }
  return true;
}

function renderCourseList() {
  const courseList = document.getElementById("course-list");
  const resultsCount = document.getElementById("results-count");
  if (!courseList) return;

  const searchBox = document.getElementById("search-box");
  const deptFilter = document.getElementById("dept-filter");
  const termFilter = document.getElementById("semester-data-filter");
  const searchTerm = searchBox ? searchBox.value.trim().toLowerCase() : "";
  const dept = deptFilter ? deptFilter.value : "";
  const termCode = termFilter ? termFilter.value : "";

  const matches = [];
  courseData.forEach((course, index) => {
    if (!courseMatchesFilters(course, searchTerm, dept, termCode)) return;
    // Discussion sections are only reachable through their lecture's
    // discussion menu — unless the family has no lecture at all (shouldn't
    // happen, but a discussion would otherwise be permanently invisible).
    if (componentOf(course) === "discussion") {
      const hasLecture = familySections(course).some((c) => componentOf(c) === "lecture");
      if (hasLecture) return;
    }
    matches.push(index);
  });

  if (resultsCount) {
    if (matches.length > MAX_RENDERED_COURSES) {
      resultsCount.textContent = `${matches.length.toLocaleString()} sections match — showing the first ${MAX_RENDERED_COURSES}. Narrow your search to see the rest.`;
    } else {
      resultsCount.textContent = `${matches.length.toLocaleString()} section${matches.length === 1 ? "" : "s"} match`;
    }
  }

  courseList.innerHTML = "";

  if (matches.length === 0) {
    const li = document.createElement("li");
    li.className = "course-list-message";
    li.textContent =
      courseData.length === 0
        ? "The course catalog is empty. Run the scraper to fetch BC course data."
        : "No courses match your filters. Try a different search term, department, or term.";
    courseList.appendChild(li);
    return;
  }

  matches.slice(0, MAX_RENDERED_COURSES).forEach((index) => {
    courseList.appendChild(buildCourseListItem(index));
  });
}

function buildCourseListItem(index) {
  const course = courseData[index];
  const uniqueId = uniqueIdFor(course);

  const li = document.createElement("li");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "course-item";
  btn.dataset.courseId = index;
  btn.dataset.uniqueId = uniqueId;
  btn.setAttribute(
    "aria-label",
    `Add ${course.code} section ${course.section}, ${course.name}, to schedule`
  );

  const topRow = document.createElement("span");
  topRow.className = "course-item-top";
  const codeEl = document.createElement("strong");
  codeEl.textContent = `${course.code}.${course.section}`;
  const creditsEl = document.createElement("span");
  creditsEl.className = "course-item-credits";
  creditsEl.textContent = `${course.credits} cr`;
  topRow.appendChild(codeEl);
  topRow.appendChild(creditsEl);
  btn.appendChild(topRow);

  const nameEl = document.createElement("span");
  nameEl.className = "course-item-name";
  nameEl.textContent = course.name;
  btn.appendChild(nameEl);

  const metaEl = document.createElement("span");
  metaEl.className = "course-item-meta";
  const metaParts = [courseTimeText(course)];
  if (course.professor && course.professor !== "Staff") {
    metaParts.push(course.professor);
  }
  if (course.room) metaParts.push(course.room);
  metaEl.textContent = metaParts.join(" · ");
  btn.appendChild(metaEl);

  if (dataMeta.terms.length > 1 || !document.getElementById("semester-data-filter")?.value) {
    const termEl = document.createElement("span");
    termEl.className = "course-item-term";
    termEl.textContent = termLabelFor(course.semester);
    btn.appendChild(termEl);
  }

  if (Array.isArray(course.additionalMeetings) && course.additionalMeetings.length > 0) {
    const extraEl = document.createElement("span");
    extraEl.className = "course-item-meta course-item-extra";
    extraEl.textContent = `Also meets: ${course.additionalMeetings.join("; ")}`;
    btn.appendChild(extraEl);
  }

  if (Array.isArray(course.prerequisites) && course.prerequisites.length > 0) {
    const prereqEl = document.createElement("span");
    prereqEl.className = "prereq-text";
    prereqEl.textContent = `Prereqs: ${course.prerequisites.join(", ")}`;
    btn.appendChild(prereqEl);
  }

  if (Array.isArray(course.corequisites) && course.corequisites.length > 0) {
    const coreqEl = document.createElement("span");
    coreqEl.className = "coreq-text";
    coreqEl.textContent = `Coreq: ${course.corequisites.join(", ")}`;
    btn.appendChild(coreqEl);
  }

  // Component chip: only lecture sections whose family actually has
  // discussions get the "Lecture" chip; every discussion gets "Discussion".
  const component = componentOf(course);
  let chipComponent = null;
  if (component === "discussion") {
    chipComponent = "discussion";
  } else if (component === "lecture") {
    const hasDiscussion = familySections(course).some((c) => componentOf(c) === "discussion");
    if (hasDiscussion) chipComponent = "lecture";
  }
  if (chipComponent) {
    const chipEl = document.createElement("span");
    chipEl.className = `component-chip component-${chipComponent}`;
    chipEl.textContent = chipComponent === "lecture" ? "Lecture" : "Discussion";
    btn.appendChild(chipEl);
  }

  const badge = document.createElement("span");
  badge.className = "scheduled-badge";
  badge.textContent = "On schedule ✓";
  btn.appendChild(badge);

  if (scheduledCourses.has(uniqueId)) {
    btn.classList.add("is-scheduled");
  }

  btn.addEventListener("click", () => addCourseToSchedule(index, true));

  // Wrap the (unchanged) add-to-schedule button with a sibling "view
  // ratings" button — a button can't nest inside a button, so this lives
  // in a flex row next to it instead of inside it.
  const row = document.createElement("div");
  row.className = "course-item-row";
  row.appendChild(btn);

  const infoBtn = document.createElement("button");
  infoBtn.type = "button";
  infoBtn.className = "ratings-info-btn";
  infoBtn.textContent = "ⓘ";
  infoBtn.dataset.courseCode = course.code;
  infoBtn.dataset.professor = course.professor;
  infoBtn.dataset.courseName = course.name;
  infoBtn.setAttribute("aria-label", `View ratings for ${course.code}`);
  infoBtn.title = "View course & professor ratings";
  row.appendChild(infoBtn);

  li.appendChild(row);

  // Discussion menu: attached AFTER the row (sibling of it, never nested
  // inside the course-item button) so a lecture's discussions live under
  // its own card, mirroring BC's official portal grouping.
  if (component === "lecture") {
    const discussions = discussionsForLecture(course);
    if (discussions.length > 0) {
      li.appendChild(buildDiscussionMenu(course, uniqueId, discussions));
    }
  }

  return li;
}

/**
 * Builds the <div class="discussion-menu"> for a lecture: a toggle button
 * plus a hidden <ul> of its relevant discussion sections (see
 * discussionsForLecture). Expand/collapse and option clicks are handled by
 * the #course-list delegated listener, not here.
 */
function buildDiscussionMenu(lecture, lectureUniqueId, discussions) {
  const menuId = `disc-menu-${lectureUniqueId.replace(/[^a-zA-Z0-9]/g, "-")}`;

  const menu = document.createElement("div");
  menu.className = "discussion-menu";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "discussion-toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", menuId);
  toggle.textContent = `▸ ${discussions.length} discussion section${discussions.length === 1 ? "" : "s"}`;
  menu.appendChild(toggle);

  const list = document.createElement("ul");
  list.className = "discussion-list";
  list.id = menuId;
  list.hidden = true;

  discussions.forEach(({ index, course: discussion }) => {
    const optionLi = document.createElement("li");

    const optionBtn = document.createElement("button");
    optionBtn.type = "button";
    optionBtn.className = "discussion-option";
    optionBtn.dataset.courseId = index;
    const discussionUniqueId = uniqueIdFor(discussion);
    optionBtn.dataset.uniqueId = discussionUniqueId;
    optionBtn.setAttribute(
      "aria-label",
      `Add ${discussion.code} discussion section ${discussion.section} to schedule`
    );

    const sectionEl = document.createElement("strong");
    sectionEl.textContent = discussion.section;
    optionBtn.appendChild(sectionEl);

    const pairsWith = Array.isArray(discussion.pairsWith) ? discussion.pairsWith : null;
    const isAnyLecture = !pairsWith || pairsWith.length === 0;
    let detailText = ` · ${courseTimeText(discussion)}`;
    if (discussion.room) detailText += ` · ${discussion.room}`;
    if (isAnyLecture) detailText += " · any lecture";
    optionBtn.appendChild(document.createTextNode(detailText));

    if (scheduledCourses.has(discussionUniqueId)) {
      optionBtn.classList.add("is-scheduled");
      const check = document.createElement("span");
      check.className = "discussion-check";
      check.textContent = "✓";
      optionBtn.appendChild(check);
    }

    optionLi.appendChild(optionBtn);
    list.appendChild(optionLi);
  });

  menu.appendChild(list);
  return menu;
}

/**
 * Opens/closes a discussion-menu: toggles the list's hidden state, the
 * toggle button's aria-expanded, and swaps the ▸/▾ glyph in its label.
 * Shared by the delegated toggle-click handler and the guided-pairing
 * auto-expand in addCourseToSchedule.
 */
function setDiscussionMenuOpen(menu, open) {
  const toggle = menu.querySelector(".discussion-toggle");
  const list = menu.querySelector(".discussion-list");
  if (!toggle || !list) return;
  list.hidden = !open;
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  toggle.textContent = toggle.textContent.replace(/^[▸▾]/, open ? "▾" : "▸");
}

/** Refresh the "On schedule" marks on currently rendered list items */
function updateScheduledMarks() {
  document.querySelectorAll("#course-list .course-item").forEach((btn) => {
    btn.classList.toggle(
      "is-scheduled",
      scheduledCourses.has(btn.dataset.uniqueId)
    );
  });
  document.querySelectorAll("#course-list .discussion-option").forEach((btn) => {
    const scheduled = scheduledCourses.has(btn.dataset.uniqueId);
    btn.classList.toggle("is-scheduled", scheduled);
    const existingCheck = btn.querySelector(".discussion-check");
    if (scheduled && !existingCheck) {
      const check = document.createElement("span");
      check.className = "discussion-check";
      check.textContent = "✓";
      btn.appendChild(check);
    } else if (!scheduled && existingCheck) {
      existingCheck.remove();
    }
  });
}

// ==========================
// RATINGS MODAL
// ==========================

/**
 * Opens the shared ratings modal (markup lives in scheduling.html, styling
 * in ratings.css) for a course, scoped to whichever professor/semester
 * sections currently appear in the catalog. Never throws — if the ratings
 * module failed to load, this just informs the user instead of crashing
 * the scheduler.
 */
function openRatingsModal(code, courseName, professor) {
  const dialog = document.getElementById("ratings-modal");
  if (!dialog) return;

  if (typeof renderCourseRatingsInto !== "function") {
    showToast("Ratings module failed to load.", { type: "error" });
    return;
  }

  const seen = new Set();
  const catalogSections = [];
  courseData.forEach((c) => {
    if (c.code !== code) return;
    const key = `${c.professor}-${c.semester}`;
    if (seen.has(key)) return;
    seen.add(key);
    catalogSections.push({
      professor: c.professor,
      semester: c.semester,
      semesterLabel: termLabelFor(c.semester),
    });
  });

  renderCourseRatingsInto(document.getElementById("ratings-modal-body"), code, {
    courseName,
    currentProfessorString: professor,
    catalogSections,
    showSchedulingLink: false,
  });

  dialog.showModal();
}

// ==========================
// TIME UTILITIES
// ==========================

function formatTime(time24) {
  if (!time24) return "";
  const [hours, minutes] = time24.split(":");
  const hour = parseInt(hours);
  if (isNaN(hour)) return time24;
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minutes} ${ampm}`;
}

function timeToPosition(time24) {
  const [hours, minutes] = time24.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes - gridStartHour * 60;
  return (totalMinutes / 30) * SLOT_HEIGHT;
}

function calculateDuration(startTime, endTime) {
  const [startHours, startMinutes] = startTime.split(":").map(Number);
  const [endHours, endMinutes] = endTime.split(":").map(Number);

  const startTotal = startHours * 60 + startMinutes;
  const endTotal = endHours * 60 + endMinutes;

  const durationMinutes = endTotal - startTotal;
  return (durationMinutes / 30) * SLOT_HEIGHT;
}

// ==========================
// TIME CONFLICT CHECKING
// ==========================

/**
 * Returns { course, day } for the first scheduled course that overlaps the
 * new course on any shared day, or null when there is no conflict.
 * Courses without fixed times never conflict.
 */
function findTimeConflict(newCourse) {
  if (!newCourse.startTime || !newCourse.endTime) return null;

  for (const day of newCourse.days || []) {
    const existingCourses = Array.from(scheduledCourseIndices.values())
      .map((index) => courseData[index])
      .filter(
        (course) =>
          course &&
          course.startTime &&
          course.endTime &&
          (course.days || []).includes(day)
      );

    for (const existing of existingCourses) {
      if (
        timesOverlap(
          newCourse.startTime,
          newCourse.endTime,
          existing.startTime,
          existing.endTime
        )
      ) {
        return { course: existing, day };
      }
    }
  }

  return null;
}

function timesOverlap(start1, end1, start2, end2) {
  const [s1h, s1m] = start1.split(":").map(Number);
  const [e1h, e1m] = end1.split(":").map(Number);
  const [s2h, s2m] = start2.split(":").map(Number);
  const [e2h, e2m] = end2.split(":").map(Number);

  if ([s1h, s1m, e1h, e1m, s2h, s2m, e2h, e2m].some(Number.isNaN)) {
    return false;
  }

  const start1Min = s1h * 60 + s1m;
  const end1Min = e1h * 60 + e1m;
  const start2Min = s2h * 60 + s2m;
  const end2Min = e2h * 60 + e2m;

  return start1Min < end2Min && end1Min > start2Min;
}

// ==========================
// ADD COURSE TO SCHEDULE
// ==========================

function addCourseToSchedule(courseId, save = true) {
  const course = courseData[courseId];
  if (!course) return;
  const uniqueId = uniqueIdFor(course);
  // Declared at function scope (not inside an `if (save)` block) because
  // it's read again further down in a second, separate `if (save)` block.
  const newComponent = componentOf(course);

  if (save) {
    const semesterSelect = document.getElementById("semester-select");
    if (!semesterSelect || !semesterSelect.value) {
      showToast("Choose a plan semester first (above the calendar), then add courses.", {
        type: "error",
      });
      return;
    }

    if (scheduledCourses.has(uniqueId)) {
      showToast(`${course.code} section ${course.section} is already on your schedule.`);
      return;
    }

    // Block a second section of the same course AND same component — two
    // lecture sections of CHEM2231, or two discussion sections of it. A
    // lecture + one discussion of the same course may both be scheduled.
    const existingSectionId = Array.from(scheduledCourseIndices.keys()).find((id) => {
      if (id === uniqueId || !id.startsWith(`${course.code}-`)) return false;
      const other = courseData[scheduledCourseIndices.get(id)];
      return other && componentOf(other) === newComponent;
    });
    if (existingSectionId) {
      const existing = courseData[scheduledCourseIndices.get(existingSectionId)];
      const sectionLabel =
        newComponent === "lecture"
          ? "a lecture section"
          : newComponent === "discussion"
          ? "a discussion section"
          : "a section";
      showToast(
        `${course.code} already has ${sectionLabel} on your schedule (${existing.section}). Remove it first to switch.`,
        { type: "error", duration: 6000 }
      );
      return;
    }

    const conflict = findTimeConflict(course);
    if (conflict) {
      const c = conflict.course;
      showToast(
        `Time conflict: ${course.code} (${courseTimeText(course)}) overlaps ${c.code} ${c.name} (${courseTimeText(c)}).`,
        { type: "error", duration: 7000 }
      );
      return;
    }
  }

  scheduledCourses.add(uniqueId);
  scheduledCourseIndices.set(uniqueId, courseId);

  // Rebuild the grid so the time range can expand for early/evening
  // classes, then re-place every block on the updated scale.
  refreshGrid();

  if (save) {
    saveSchedule();
    if (isPlaceable(course)) {
      scrollBlockIntoView(uniqueId);
    }
    if (!isPlaceable(course)) {
      showToast(
        `${course.code} added — it has no fixed weekday meeting (${scheduleTypeLabel(course).toLowerCase()}), so it appears below the calendar.`,
        { type: "success", duration: 6000 }
      );
    } else {
      showToast(`${course.code} added to your schedule.`, { type: "success", duration: 2500 });
    }

    // Guided pairing: a newly-added lecture whose family has discussions,
    // with none scheduled yet, filters the list to this course so the
    // learner can immediately pick a discussion section.
    if (newComponent === "lecture") {
      const hasDiscussions = familySections(course).some((c) => componentOf(c) === "discussion");
      const alreadyHasDiscussion = scheduledSectionsOfCourse(course.code, "discussion").length > 0;
      if (hasDiscussions && !alreadyHasDiscussion) {
        const lectureBtn = document.querySelector(
          `#course-list button.course-item[data-unique-id="${uniqueId}"]`
        );
        const row = lectureBtn ? lectureBtn.closest(".course-item-row") : null;
        const menu =
          row && row.nextElementSibling && row.nextElementSibling.classList.contains("discussion-menu")
            ? row.nextElementSibling
            : null;
        if (menu) {
          setDiscussionMenuOpen(menu, true);
          menu.scrollIntoView({ block: "nearest" });
        }
        showToast(`${course.code} also has discussion sections — pick one below.`, {
          duration: 6000,
        });
      }
    } else if (newComponent === "discussion") {
      // Reverse hint: added a discussion with no lecture of this course
      // scheduled yet (only when the family actually has lectures).
      const hasLectures = familySections(course).some((c) => componentOf(c) === "lecture");
      const alreadyHasLecture = scheduledSectionsOfCourse(course.code, "lecture").length > 0;
      if (hasLectures && !alreadyHasLecture) {
        showToast(`Don't forget ${course.code}'s lecture section.`, { duration: 6000 });
      }
    }

    // Corequisite hint: none of the coreq codes are on the schedule yet.
    // Shown after the pairing/reverse hint above (showToast stacks).
    if (Array.isArray(course.corequisites) && course.corequisites.length > 0) {
      const scheduledCodes = new Set();
      scheduledCourseIndices.forEach((index) => {
        const c = courseData[index];
        if (c) scheduledCodes.add(c.code);
      });
      const anyCoreqScheduled = course.corequisites.some((code) => scheduledCodes.has(code));
      if (!anyCoreqScheduled) {
        showToast(
          `${course.code} has a corequisite: ${course.corequisites.join(", ")} — search for it to add a section.`,
          { duration: 6000 }
        );
      }
    }
  }

  updateCreditCounter();
  renderUnscheduledList();
  updateScheduledMarks();
  updateGridStatus();
}

// ==========================
// CREATE COURSE BLOCK
// ==========================

function createCourseBlock(course, uniqueId) {
  const block = document.createElement("div");
  block.classList.add("course-block");

  block.dataset.uniqueId = uniqueId;
  block.dataset.code = course.code;
  block.dataset.section = course.section;

  const color = getCourseColor(uniqueId);
  block.style.background = color.bg;
  block.style.borderColor = color.border;

  const topPosition = timeToPosition(course.startTime);
  const height = calculateDuration(course.startTime, course.endTime);

  block.style.top = `${topPosition}px`;
  block.style.height = `${height - 2}px`;

  const codeEl = document.createElement("strong");
  codeEl.textContent = `${course.code}.${course.section}`;
  block.appendChild(codeEl);

  const nameEl = document.createElement("span");
  nameEl.className = "course-block-name";
  nameEl.textContent = course.name;
  block.appendChild(nameEl);

  const timeEl = document.createElement("small");
  timeEl.textContent = `${formatTime(course.startTime)}–${formatTime(course.endTime)}`;
  if (Array.isArray(course.additionalMeetings) && course.additionalMeetings.length > 0) {
    timeEl.textContent += " +";
    block.title = `Also meets: ${course.additionalMeetings.join("; ")}`;
  }
  block.appendChild(timeEl);

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.textContent = "✕";
  removeBtn.classList.add("remove-btn");
  removeBtn.setAttribute(
    "aria-label",
    `Remove ${course.code} from schedule`
  );
  removeBtn.onclick = (e) => {
    e.stopPropagation();
    removeCourseFromSchedule(uniqueId);
  };

  block.appendChild(removeBtn);

  return block;
}

// ==========================
// REMOVE COURSE FROM SCHEDULE
// ==========================

function removeCourseFromSchedule(uniqueId) {
  scheduledCourses.delete(uniqueId);
  scheduledCourseIndices.delete(uniqueId);
  courseColors.delete(uniqueId);

  // Re-render so the time range can contract back toward the baseline
  refreshGrid();

  saveSchedule();
  updateCreditCounter();
  renderUnscheduledList();
  updateScheduledMarks();
  updateGridStatus();
}

// ==========================
// UNSCHEDULED (NO MEETING TIME) LIST
// ==========================

function renderUnscheduledList() {
  const section = document.getElementById("unscheduled-section");
  const list = document.getElementById("unscheduled-list");
  if (!section || !list) return;

  const unplaceable = [];
  scheduledCourseIndices.forEach((index, uniqueId) => {
    const course = courseData[index];
    if (course && !isPlaceable(course)) {
      unplaceable.push({ course, uniqueId });
    }
  });

  list.innerHTML = "";
  section.hidden = unplaceable.length === 0;

  unplaceable.forEach(({ course, uniqueId }) => {
    const li = document.createElement("li");
    li.className = "unscheduled-item";

    const info = document.createElement("div");
    info.className = "unscheduled-info";

    const titleEl = document.createElement("strong");
    titleEl.textContent = `${course.code}.${course.section} — ${course.name}`;
    info.appendChild(titleEl);

    const metaEl = document.createElement("span");
    metaEl.className = "course-item-meta";
    const parts = [scheduleTypeLabel(course) || "No meeting time listed", `${course.credits} cr`];
    if (course.scheduleType === "weekend") {
      parts[0] = `${scheduleTypeLabel(course)}: ${courseTimeText(course)}`;
    }
    if (course.professor && course.professor !== "Staff") parts.push(course.professor);
    metaEl.textContent = parts.join(" · ");
    info.appendChild(metaEl);

    li.appendChild(info);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-btn unscheduled-remove";
    removeBtn.textContent = "✕";
    removeBtn.setAttribute("aria-label", `Remove ${course.code} from schedule`);
    removeBtn.addEventListener("click", () => removeCourseFromSchedule(uniqueId));
    li.appendChild(removeBtn);

    list.appendChild(li);
  });
}

// ==========================
// GRID STATUS / EMPTY STATES
// ==========================

function updateGridStatus() {
  const status = document.getElementById("grid-status");
  if (!status) return;

  const semesterSelect = document.getElementById("semester-select");
  const semester = semesterSelect ? semesterSelect.value : "";

  if (!semester) {
    status.hidden = false;
    status.textContent =
      "Select a plan semester above to start building a schedule. Each semester keeps its own saved schedule.";
  } else if (scheduledCourses.size === 0) {
    status.hidden = false;
    status.textContent = `No classes in your ${semesterDisplayName(semester)} schedule yet — click a course on the left to add it.`;
  } else {
    status.hidden = true;
  }
}

function updateExportHint() {
  const hint = document.getElementById("export-hint");
  if (!hint) return;
  const semesterSelect = document.getElementById("semester-select");
  const semester = semesterSelect ? semesterSelect.value : "";
  hint.textContent = semester
    ? `Export adds these classes to ${semesterDisplayName(semester)} in your 4-Year Plan.`
    : "Export adds your scheduled classes to the matching semester of your 4-Year Plan.";
}

// ==========================
// SAVE & LOAD
// ==========================

function currentSemesterId() {
  const semesterSelect = document.getElementById("semester-select");
  return semesterSelect ? semesterSelect.value : "";
}

function saveSchedule() {
  const currentSemester = currentSemesterId();
  if (!currentSemester) return;

  const scheduleArray = Array.from(scheduledCourses);
  const key = `${STORAGE_KEYS.SCHEDULE_PREFIX}${currentSemester}`;

  const meta = readStoredJSON(STORAGE_KEYS.SCHEDULE_META, {}) || {};

  if (scheduleArray.length === 0) {
    removeStored(key);
    delete meta[currentSemester];
  } else {
    writeStoredJSON(key, scheduleArray);

    let credits = 0;
    scheduledCourseIndices.forEach((index) => {
      const course = courseData[index];
      if (course) credits += course.credits;
    });
    meta[currentSemester] = {
      credits,
      courseCount: scheduleArray.length,
      updatedAt: new Date().toISOString(),
    };
  }

  writeStoredJSON(STORAGE_KEYS.SCHEDULE_META, meta);
}

function loadSchedule() {
  const currentSemester = currentSemesterId();
  if (!currentSemester) return;

  const savedIDs = readStoredJSON(
    `${STORAGE_KEYS.SCHEDULE_PREFIX}${currentSemester}`,
    []
  );
  if (!Array.isArray(savedIDs) || savedIDs.length === 0) return;

  let missing = 0;
  savedIDs.forEach((savedId) => {
    // Current ids are CODE-SECTION-TERM; older saves used CODE-SECTION
    let courseIndex = courseData.findIndex((c) => uniqueIdFor(c) === savedId);
    if (courseIndex === -1) {
      courseIndex = courseData.findIndex(
        (c) => `${c.code}-${c.section}` === savedId
      );
    }

    if (courseIndex !== -1) {
      addCourseToSchedule(courseIndex, false);
    } else {
      missing++;
    }
  });

  if (missing > 0) {
    showToast(
      `${missing} saved course${missing === 1 ? " is" : "s are"} no longer in the current catalog and ${missing === 1 ? "was" : "were"} skipped.`,
      { duration: 6000 }
    );
    // Persist the cleaned-up list
    saveSchedule();
  }

  updateCreditCounter();
  renderUnscheduledList();
  updateScheduledMarks();
  updateGridStatus();
}

// ==========================
// CREDIT COUNTER
// ==========================

function updateCreditCounter() {
  let totalCredits = 0;

  scheduledCourseIndices.forEach((index) => {
    const course = courseData[index];
    if (course) {
      totalCredits += course.credits;
    }
  });

  const creditDisplay = document.getElementById("total-credits");
  if (creditDisplay) {
    creditDisplay.textContent = totalCredits;
  }
}

// ==========================
// CLEAR SCHEDULE DISPLAY
// ==========================

function clearScheduleDisplay() {
  scheduledCourses.clear();
  scheduledCourseIndices.clear();
  courseColors.clear();
  colorIndex = 0;

  refreshGrid();
  updateCreditCounter();
  renderUnscheduledList();
  updateScheduledMarks();
}

// ==========================
// INITIALIZATION
// ==========================

function restoreSelectedSemester() {
  const semesterSelect = document.getElementById("semester-select");
  if (!semesterSelect) return;

  let savedSemester = null;
  try {
    savedSemester = localStorage.getItem(STORAGE_KEYS.SELECTED_SEMESTER);
  } catch (e) {
    /* storage unavailable */
  }
  if (savedSemester && SEMESTER_IDS.includes(savedSemester)) {
    semesterSelect.value = savedSemester;
    loadSchedule();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // ?search= deep link (e.g. from a "View sections in Scheduling" link on
  // the ratings page) — set the box before the first loadCourseData() so
  // its initial renderCourseList() call picks the term up immediately.
  const searchBox = document.getElementById("search-box");
  const params = new URLSearchParams(location.search);
  const preSearch = params.get("search");
  if (preSearch && searchBox) {
    searchBox.value = preSearch;
  }

  loadCourseData();

  // Search input (debounced re-render)
  if (searchBox) {
    let debounceTimer = null;
    searchBox.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(renderCourseList, 150);
    });
  }

  // Plan-semester selection
  const semesterSelect = document.getElementById("semester-select");
  if (semesterSelect) {
    semesterSelect.addEventListener("change", () => {
      try {
        localStorage.setItem(STORAGE_KEYS.SELECTED_SEMESTER, semesterSelect.value);
      } catch (e) {
        /* storage unavailable */
      }
      clearScheduleDisplay();
      loadSchedule();
      updateExportHint();
      updateGridStatus();
    });
  }

  // Reset button
  const resetBtn = document.getElementById("reset-schedule-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      const currentSemester = currentSemesterId();
      if (!currentSemester) {
        showToast("Select a plan semester first.", { type: "error" });
        return;
      }

      if (
        !confirm(
          `Clear your ${semesterDisplayName(currentSemester)} schedule? This only affects this semester's schedule — your 4-Year Plan is not changed.`
        )
      ) {
        return;
      }

      scheduledCourses.clear();
      scheduledCourseIndices.clear();
      courseColors.clear();
      colorIndex = 0;

      removeStored(`${STORAGE_KEYS.SCHEDULE_PREFIX}${currentSemester}`);
      const meta = readStoredJSON(STORAGE_KEYS.SCHEDULE_META, {}) || {};
      delete meta[currentSemester];
      writeStoredJSON(STORAGE_KEYS.SCHEDULE_META, meta);

      refreshGrid();
      updateCreditCounter();
      renderUnscheduledList();
      updateScheduledMarks();
      updateGridStatus();
      showToast(`${semesterDisplayName(currentSemester)} schedule cleared.`, {
        type: "success",
      });
    });
  }

  // Export button
  const exportBtn = document.getElementById("export-schedule-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const currentSemester = currentSemesterId();
      if (!currentSemester) {
        showToast("Select a plan semester before exporting.", { type: "error" });
        return;
      }

      if (scheduledCourses.size === 0) {
        showToast("Nothing to export yet — add some courses to your schedule first.", {
          type: "error",
        });
        return;
      }

      const exportData = {
        semester: currentSemester,
        courses: [],
      };

      // Discussion sections carry 0 credits and share their lecture's
      // course name — exporting them too would create a duplicate-name
      // 0-credit row in the 4-Year Plan, so only lecture/standalone
      // sections are exported; discussions are implicitly part of the
      // lecture course.
      let skippedDiscussions = 0;
      scheduledCourseIndices.forEach((index) => {
        const course = courseData[index];
        if (!course) return;
        if (componentOf(course) === "discussion") {
          skippedDiscussions++;
          return;
        }
        exportData.courses.push({
          name: course.name,
          credits: course.credits,
        });
      });

      if (exportData.courses.length === 0) {
        showToast(
          "Nothing to export yet — discussion sections aren't exported on their own. Add a lecture section too.",
          { type: "error", duration: 6000 }
        );
        return;
      }

      if (skippedDiscussions > 0) {
        exportData.skippedDiscussions = skippedDiscussions;
      }

      writeStoredJSON(STORAGE_KEYS.EXPORT, exportData);
      window.location.href = "plan.html";
    });
  }

  // Ratings info button + discussion menu (event delegation — list items
  // are re-rendered often, so listeners are bound once on the container).
  const courseList = document.getElementById("course-list");
  if (courseList) {
    courseList.addEventListener("click", (e) => {
      const ratingsBtn = e.target.closest(".ratings-info-btn");
      if (ratingsBtn) {
        e.stopPropagation();
        openRatingsModal(ratingsBtn.dataset.courseCode, ratingsBtn.dataset.courseName, ratingsBtn.dataset.professor);
        return;
      }

      const toggleBtn = e.target.closest(".discussion-toggle");
      if (toggleBtn) {
        const menu = toggleBtn.closest(".discussion-menu");
        const list = menu ? menu.querySelector(".discussion-list") : null;
        if (menu && list) {
          setDiscussionMenuOpen(menu, list.hidden);
        }
        return;
      }

      const optionBtn = e.target.closest(".discussion-option");
      if (optionBtn) {
        addCourseToSchedule(Number(optionBtn.dataset.courseId), true);
      }
    });
  }

  // Ratings modal close wiring (close button + backdrop click; ESC works natively)
  const ratingsModal = document.getElementById("ratings-modal");
  if (ratingsModal) {
    const closeBtn = ratingsModal.querySelector(".ratings-modal-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => ratingsModal.close());
    }
    ratingsModal.addEventListener("click", (e) => {
      // e.target is the dialog both for true backdrop clicks and clicks on
      // the dialog's own padding — only close when outside the dialog box.
      if (e.target !== ratingsModal) return;
      const rect = ratingsModal.getBoundingClientRect();
      const outside =
        e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top || e.clientY > rect.bottom;
      if (outside) ratingsModal.close();
    });
  }
});
