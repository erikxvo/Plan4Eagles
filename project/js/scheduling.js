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
    { bg: "#fff8d9", border: "#d4bd7a" },
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
// LOAD COURSE DATA FROM JSON
// ==========================

let courseData = [];
const scheduledCourses = new Set();
const scheduledCourseIndices = new Map(); // uniqueId -> courseData index

async function loadCourseData() {
  try {
    const response = await fetch("project/data/courses.json");
    courseData = await response.json();
    populateDeptFilter();
    populateCourseList();

    const semesterSelect = document.getElementById("semester-select");
    if (semesterSelect && semesterSelect.value) {
      loadSchedule();
    }
  } catch (error) {
    console.error("Error loading course data:", error);
    alert("Failed to load course data. Please check that courses.json exists.");
  }
}

document.addEventListener("DOMContentLoaded", loadCourseData);

// ==========================
// DEPARTMENT FILTER
// ==========================

function populateDeptFilter() {
  const deptFilter = document.getElementById("dept-filter");
  if (!deptFilter) return;

  // Extract unique department prefixes
  const depts = new Map();
  courseData.forEach((course) => {
    const prefix = course.code.replace(/[0-9]/g, "");
    if (!depts.has(prefix)) {
      const deptNames = {
        "CSCI": "Computer Science",
        "MATH": "Mathematics",
        "ECON": "Economics",
        "PHYS": "Physics",
        "BIOL": "Biology",
        "CHEM": "Chemistry",
        "PSYC": "Psychology",
        "POLI": "Political Science",
        "ENGL": "English",
        "PHIL": "Philosophy",
        "THEO": "Theology",
        "HIST": "History",
        "SOCY": "Sociology",
        "ARTS": "Arts",
        "SPAN": "Spanish",
        "FREN": "French",
      };
      depts.set(prefix, deptNames[prefix] || prefix);
    }
  });

  // Sort and add options
  const sorted = Array.from(depts.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  sorted.forEach(([code, name]) => {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = `${code} - ${name}`;
    deptFilter.appendChild(option);
  });

  // Attach listener
  deptFilter.addEventListener("change", filterCourseList);
}

// ==========================
// POPULATE COURSE LIST
// ==========================

function populateCourseList() {
  const courseList = document.querySelector(".course-search #course-list");
  courseList.innerHTML = "";

  courseData.forEach((course, index) => {
    const li = document.createElement("li");

    const timeStr = `${course.days.join("")} ${formatTime(
      course.startTime
    )}-${formatTime(course.endTime)}`;

    // Show prerequisite info if any
    const prereqText = course.prerequisites && course.prerequisites.length > 0
      ? `<br><small class="prereq-text">Prereqs: ${course.prerequisites.join(", ")}</small>`
      : "";

    li.innerHTML = `
      <strong>${course.code}.${course.section}</strong> — ${course.name}<br>
      <small>${timeStr} | ${course.professor} | ${course.credits} cr</small>
      ${prereqText}
    `;

    li.dataset.courseId = index;
    li.dataset.dept = course.code.replace(/[0-9]/g, "");
    li.addEventListener("click", () => addCourseToSchedule(index, true));

    courseList.appendChild(li);
  });
}

// ==========================
// FILTER COURSE LIST
// ==========================

function filterCourseList() {
  const searchBox = document.getElementById("search-box");
  const deptFilter = document.getElementById("dept-filter");
  const searchTerm = searchBox ? searchBox.value.toLowerCase() : "";
  const selectedDept = deptFilter ? deptFilter.value : "";

  const courseListItems = document.querySelectorAll(
    ".course-search #course-list li"
  );

  courseListItems.forEach((item) => {
    const courseText = item.textContent.toLowerCase();
    const dept = item.dataset.dept;

    const matchesSearch = !searchTerm || courseText.includes(searchTerm);
    const matchesDept = !selectedDept || dept === selectedDept;

    item.style.display = matchesSearch && matchesDept ? "block" : "none";
  });
}

// ==========================
// TIME UTILITIES
// ==========================

function formatTime(time24) {
  const [hours, minutes] = time24.split(":");
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minutes} ${ampm}`;
}

function timeToPosition(time24) {
  const [hours, minutes] = time24.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes - 9 * 60;
  return (totalMinutes / 30) * 45;
}

function calculateDuration(startTime, endTime) {
  const [startHours, startMinutes] = startTime.split(":").map(Number);
  const [endHours, endMinutes] = endTime.split(":").map(Number);

  const startTotal = startHours * 60 + startMinutes;
  const endTotal = endHours * 60 + endMinutes;

  const durationMinutes = endTotal - startTotal;
  return (durationMinutes / 30) * 45;
}

// ==========================
// TIME CONFLICT CHECKING
// ==========================

function hasTimeConflict(newCourse) {
  for (const day of newCourse.days) {
    const existingCourses = Array.from(scheduledCourseIndices.values())
      .map((index) => courseData[index])
      .filter((course) => course && course.days.includes(day));

    for (const existing of existingCourses) {
      if (
        timesOverlap(
          newCourse.startTime,
          newCourse.endTime,
          existing.startTime,
          existing.endTime
        )
      ) {
        return existing;
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
  const uniqueId = `${course.code}-${course.section}`;

  if (scheduledCourses.has(uniqueId)) {
    if (save) {
      alert(
        `${course.code} Section ${course.section} is already on your schedule!`
      );
    }
    return;
  }

  if (save) {
    const conflict = hasTimeConflict(course);
    if (conflict) {
      alert(
        `Time conflict! ${course.code} overlaps with ${conflict.code} (${conflict.name})`
      );
      return;
    }
  }

  const daySlots = document.querySelectorAll(".day-slots");

  course.days.forEach((day) => {
    const daySlot = Array.from(daySlots).find(
      (slot) => slot.dataset.day === day
    );

    if (daySlot) {
      const block = createCourseBlock(course, uniqueId);
      daySlot.appendChild(block);
    }
  });

  scheduledCourses.add(uniqueId);
  scheduledCourseIndices.set(uniqueId, courseId);

  if (save) saveSchedule();

  updateCreditCounter();
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

  block.innerHTML = `
    <strong>${course.code}.${course.section}</strong><br>
    ${course.name}<br>
    <small>${formatTime(course.startTime)}-${formatTime(course.endTime)}</small>
  `;

  const removeBtn = document.createElement("span");
  removeBtn.textContent = "\u2715";
  removeBtn.classList.add("remove-btn");
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
  const blocks = document.querySelectorAll(`[data-unique-id="${uniqueId}"]`);
  blocks.forEach((block) => block.remove());

  scheduledCourses.delete(uniqueId);
  scheduledCourseIndices.delete(uniqueId);
  courseColors.delete(uniqueId);

  saveSchedule();
  updateCreditCounter();
}

// ==========================
// SEARCH FUNCTIONALITY
// ==========================

const searchBox = document.getElementById("search-box");

if (searchBox) {
  searchBox.addEventListener("input", filterCourseList);
}

// ==========================
// SAVE & LOAD
// ==========================

function saveSchedule() {
  const semesterSelect = document.getElementById("semester-select");
  const currentSemester = semesterSelect ? semesterSelect.value : "";

  if (!currentSemester) return;

  const scheduleArray = Array.from(scheduledCourses);

  localStorage.setItem(
    `bc_career_planner_schedule_${currentSemester}`,
    JSON.stringify(scheduleArray)
  );
}

function loadSchedule() {
  const semesterSelect = document.getElementById("semester-select");
  const currentSemester = semesterSelect ? semesterSelect.value : "";

  if (!currentSemester) return;

  const savedData = localStorage.getItem(
    `bc_career_planner_schedule_${currentSemester}`
  );
  if (!savedData) return;

  const savedIDs = JSON.parse(savedData);

  savedIDs.forEach((uniqueId) => {
    const courseIndex = courseData.findIndex(
      (c) => `${c.code}-${c.section}` === uniqueId
    );

    if (courseIndex !== -1) {
      addCourseToSchedule(courseIndex, false);
    }
  });

  updateCreditCounter();
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
// RESET BUTTON LOGIC
// ==========================

const resetBtn = document.getElementById("reset-schedule-btn");

if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    const semesterSelect = document.getElementById("semester-select");
    const currentSemester = semesterSelect ? semesterSelect.value : "";

    if (!currentSemester) {
      alert("Please select a semester first!");
      return;
    }

    if (
      !confirm(
        `Are you sure you want to clear your ${getSemesterDisplayName(
          currentSemester
        )} schedule? This cannot be undone.`
      )
    ) {
      return;
    }

    scheduledCourses.clear();
    scheduledCourseIndices.clear();
    courseColors.clear();
    colorIndex = 0;
    localStorage.removeItem(`bc_career_planner_schedule_${currentSemester}`);

    document
      .querySelectorAll(".course-block")
      .forEach((block) => block.remove());

    updateCreditCounter();
  });
}

function getSemesterDisplayName(semesterId) {
  const names = {
    "freshman-fall": "Freshman Fall",
    "freshman-spring": "Freshman Spring",
    "sophomore-fall": "Sophomore Fall",
    "sophomore-spring": "Sophomore Spring",
    "junior-fall": "Junior Fall",
    "junior-spring": "Junior Spring",
    "senior-fall": "Senior Fall",
    "senior-spring": "Senior Spring",
  };
  return names[semesterId] || semesterId;
}

// ==========================
// EXPORT TO 4-YEAR PLAN
// ==========================

const exportBtn = document.getElementById("export-schedule-btn");
const semesterSelect = document.getElementById("semester-select");

if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    if (!semesterSelect || !semesterSelect.value) {
      alert("Please select a semester before exporting!");
      return;
    }

    if (scheduledCourses.size === 0) {
      alert("No courses to export! Add some courses to your schedule first.");
      return;
    }

    const exportData = {
      semester: semesterSelect.value,
      courses: [],
    };

    scheduledCourseIndices.forEach((index) => {
      const course = courseData[index];
      if (course) {
        exportData.courses.push({
          name: course.name,
          credits: course.credits,
        });
      }
    });

    localStorage.setItem(
      "bc_career_planner_export",
      JSON.stringify(exportData)
    );

    window.location.href = "plan.html";
  });
}

// Save selected semester
if (semesterSelect) {
  semesterSelect.addEventListener("change", () => {
    localStorage.setItem(
      "bc_career_planner_selected_semester",
      semesterSelect.value
    );

    clearScheduleDisplay();
    loadSchedule();
  });

  const savedSemester = localStorage.getItem(
    "bc_career_planner_selected_semester"
  );
  if (savedSemester) {
    semesterSelect.value = savedSemester;
    loadSchedule();
  }
}

// ==========================
// CLEAR SCHEDULE DISPLAY
// ==========================

function clearScheduleDisplay() {
  document.querySelectorAll(".course-block").forEach((block) => block.remove());

  scheduledCourses.clear();
  scheduledCourseIndices.clear();
  courseColors.clear();
  colorIndex = 0;

  updateCreditCounter();
}
