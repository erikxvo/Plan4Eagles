/* ==========================================
   4-YEAR PLANNER + GPA CALCULATOR - Plan4Eagles
   Depends on storage.js + ui.js (loaded first).
   ========================================== */

document.addEventListener("DOMContentLoaded", () => {
  // ==========================================
  // 1. SETUP
  // ==========================================
  const majorSelect = document.getElementById("major-select");
  const majorReqList = document.getElementById("major-req-list");
  const reqContainer = document.querySelector(".requirements");
  const reqProgress = document.querySelector(".req-progress");
  const resetPlanBtn = document.getElementById("reset-plan-btn");
  const gpaValue = document.getElementById("gpa-value");
  const gpaSummary = document.getElementById("gpa-summary");
  const totalPlanned = document.getElementById("total-planned");
  const planStatus = document.getElementById("plan-status");

  let majorsData = [];

  // Each semester shows this many editable rows by default. Blank rows are
  // visual slots only — they are never persisted. Extra rows beyond the
  // default are added explicitly with the "+ Add Class" button (no cap).
  const DEFAULT_ROWS = 5;

  const GRADE_OPTIONS = [
    "", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F",
  ];

  // ==========================================
  // 2. GRID GENERATION
  // ==========================================

  function buildCourseRow(course = { name: "", credits: "", grade: "" }, semesterId) {
    const row = document.createElement("div");
    row.className = "course-row";

    const nameInput = document.createElement("input");
    nameInput.className = "course-input";
    nameInput.placeholder = "Course";
    nameInput.value = course.name || "";
    nameInput.setAttribute("aria-label", `Course name, ${semesterDisplayName(semesterId)}`);
    row.appendChild(nameInput);

    const creditInput = document.createElement("input");
    creditInput.className = "credit-input";
    creditInput.type = "number";
    creditInput.min = "0";
    creditInput.max = "12";
    creditInput.step = "0.5";
    creditInput.inputMode = "decimal";
    creditInput.placeholder = "0";
    creditInput.value = course.credits || "";
    creditInput.setAttribute("aria-label", `Credits, ${semesterDisplayName(semesterId)}`);
    row.appendChild(creditInput);

    const gradeSelect = document.createElement("select");
    gradeSelect.className = "grade-select";
    gradeSelect.setAttribute("aria-label", `Grade, ${semesterDisplayName(semesterId)}`);
    GRADE_OPTIONS.forEach((g) => {
      const opt = document.createElement("option");
      opt.value = g;
      opt.textContent = g === "" ? "--" : g;
      gradeSelect.appendChild(opt);
    });
    gradeSelect.value = GRADE_OPTIONS.includes(course.grade) ? course.grade : "";
    row.appendChild(gradeSelect);

    const controls = document.createElement("div");
    controls.className = "row-controls";

    const moveSelect = document.createElement("select");
    moveSelect.className = "row-move";
    moveSelect.title = "Move course to another semester";
    moveSelect.setAttribute("aria-label", "Move course to another semester");
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "⇄";
    moveSelect.appendChild(placeholder);
    SEMESTER_IDS.filter((id) => id !== semesterId).forEach((id) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = semesterDisplayName(id);
      moveSelect.appendChild(opt);
    });
    controls.appendChild(moveSelect);

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "row-clear";
    clearBtn.textContent = "✕";
    clearBtn.title = "Remove class";
    clearBtn.setAttribute("aria-label", "Remove class");
    controls.appendChild(clearBtn);

    row.appendChild(controls);
    return row;
  }

  function buildSemester(semesterId, semesterLabel, courses) {
    const semester = document.createElement("div");
    semester.className = "semester";
    semester.dataset.semester = semesterId;

    const heading = document.createElement("h4");
    heading.textContent = semesterLabel;
    semester.appendChild(heading);

    const table = document.createElement("div");
    table.className = "semester-table";

    const header = document.createElement("div");
    header.className = "semester-header";
    ["Course", "Credits", "Grade", ""].forEach((label) => {
      const span = document.createElement("span");
      span.textContent = label;
      header.appendChild(span);
    });
    table.appendChild(header);

    const rowsWrap = document.createElement("div");
    rowsWrap.className = "semester-rows";
    const rowCount = Math.max(courses.length, DEFAULT_ROWS);
    for (let i = 0; i < rowCount; i++) {
      rowsWrap.appendChild(buildCourseRow(courses[i], semesterId));
    }
    table.appendChild(rowsWrap);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "add-class-btn";
    addBtn.textContent = "+ Add Class";
    addBtn.setAttribute(
      "aria-label",
      `Add a class row to ${semesterDisplayName(semesterId)}`
    );
    table.appendChild(addBtn);

    const footer = document.createElement("div");
    footer.className = "semester-footer";
    const totalLabel = document.createElement("span");
    totalLabel.textContent = "Totals";
    const totalValue = document.createElement("span");
    totalValue.className = "semester-total";
    totalValue.textContent = "0";
    totalValue.title = "Semester credits";
    const gpaSpan = document.createElement("span");
    gpaSpan.className = "semester-gpa";
    gpaSpan.textContent = "--";
    gpaSpan.title = "Semester GPA";
    const spacer = document.createElement("span");
    footer.appendChild(totalLabel);
    footer.appendChild(totalValue);
    footer.appendChild(gpaSpan);
    footer.appendChild(spacer);
    table.appendChild(footer);

    semester.appendChild(table);
    return semester;
  }

  function renderGrid(planData) {
    const gridContainer = document.querySelector(".year-grid");
    if (!gridContainer) return;
    gridContainer.innerHTML = "";

    const years = ["Freshman", "Sophomore", "Junior", "Senior"];
    const semesters = ["Fall", "Spring"];

    years.forEach((year) => {
      const block = document.createElement("section");
      block.className = "year-block";

      const heading = document.createElement("h3");
      heading.textContent = `${year} Year`;
      block.appendChild(heading);

      const semestersWrap = document.createElement("div");
      semestersWrap.className = "semesters";

      semesters.forEach((sem) => {
        const semesterId = `${year.toLowerCase()}-${sem.toLowerCase()}`;
        const courses =
          planData && planData.semesters && Array.isArray(planData.semesters[semesterId])
            ? planData.semesters[semesterId]
            : [];
        semestersWrap.appendChild(buildSemester(semesterId, sem, courses));
      });

      block.appendChild(semestersWrap);

      const totalRow = document.createElement("div");
      totalRow.className = "year-total-row";
      const totalLabel = document.createElement("span");
      totalLabel.textContent = `${year} Year Total`;
      const totalValue = document.createElement("span");
      totalValue.className = "year-total-value";
      totalValue.textContent = "0";
      totalRow.appendChild(totalLabel);
      totalRow.appendChild(totalValue);
      block.appendChild(totalRow);

      gridContainer.appendChild(block);
    });
  }

  /** Appends one empty row to a semester and returns it */
  function addRow(semesterElem) {
    const rowsWrap = semesterElem.querySelector(".semester-rows");
    const row = buildCourseRow(undefined, semesterElem.dataset.semester);
    rowsWrap.appendChild(row);
    return row;
  }

  /** True for rows beyond the five default slots */
  function isExtraRow(row) {
    const rowsWrap = row.parentElement;
    return Array.from(rowsWrap.children).indexOf(row) >= DEFAULT_ROWS;
  }

  function rowHasContent(row) {
    const name = row.querySelector(".course-input")?.value.trim();
    const credits = row.querySelector(".credit-input")?.value;
    const grade = row.querySelector(".grade-select")?.value;
    return Boolean(name || credits || grade);
  }

  /** Returns the first empty row in a semester, creating one if needed */
  function firstEmptyRow(semesterElem) {
    const rowsWrap = semesterElem.querySelector(".semester-rows");
    const rows = Array.from(rowsWrap.querySelectorAll(".course-row"));
    const empty = rows.find((row) => !rowHasContent(row));
    if (empty) return empty;
    return addRow(semesterElem);
  }

  function setRow(row, course) {
    row.querySelector(".course-input").value = course.name || "";
    row.querySelector(".credit-input").value = course.credits || "";
    row.querySelector(".grade-select").value = course.grade || "";
  }

  function clearRow(row) {
    setRow(row, { name: "", credits: "", grade: "" });
    const moveSelect = row.querySelector(".row-move");
    if (moveSelect) moveSelect.value = "";
  }

  function semesterCourseNames(semesterElem) {
    return Array.from(semesterElem.querySelectorAll(".course-input"))
      .map((input) => input.value.trim().toLowerCase())
      .filter(Boolean);
  }

  // ==========================================
  // 3. MAJOR REQUIREMENTS
  // ==========================================

  function populateMajorDropdown() {
    if (!majorSelect) return;
    majorSelect.innerHTML = '<option value="">-- choose a major --</option>';
    majorsData.forEach((major) => {
      const option = document.createElement("option");
      option.value = major.id;
      option.textContent = major.name;
      majorSelect.appendChild(option);
    });
  }

  function renderMajorRequirements(majorId) {
    if (!majorReqList) return;
    majorReqList.innerHTML = "";

    const selectedMajor = majorsData.find((m) => m.id === majorId);

    if (!selectedMajor) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "Choose a major to see its classes.";
      majorReqList.appendChild(li);
      updateReqProgress();
      return;
    }

    selectedMajor.requirements.forEach((reqName) => {
      const li = document.createElement("li");
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      const span = document.createElement("span");
      span.textContent = reqName;
      label.appendChild(checkbox);
      label.appendChild(span);
      li.appendChild(label);
      majorReqList.appendChild(li);
    });

    updateReqProgress();
  }

  function updateReqProgress() {
    if (!reqProgress || !reqContainer) return;
    const boxes = reqContainer.querySelectorAll("input[type='checkbox']");
    const total = boxes.length;
    let done = 0;
    boxes.forEach((cb) => {
      if (cb.checked) done++;
    });

    if (total === 0) {
      reqProgress.textContent = "Select a major to track progress";
    } else {
      const pct = Math.round((done / total) * 100);
      reqProgress.textContent = `${done} / ${total} requirements completed (${pct}%)`;
    }
  }

  // ==========================================
  // 4. TOTALS + GPA
  // ==========================================

  function updateSemesterAndYearTotals() {
    let grandTotal = 0;

    document.querySelectorAll(".semester-table").forEach((table) => {
      let sum = 0;
      table.querySelectorAll(".credit-input").forEach((input) => {
        const value = parseFloat(input.value);
        if (!Number.isNaN(value)) sum += value;
      });
      const totalElem = table.querySelector(".semester-total");
      if (totalElem) totalElem.textContent = sum.toString();
      grandTotal += sum;
    });

    document.querySelectorAll(".year-block").forEach((block) => {
      let yearSum = 0;
      block.querySelectorAll(".semester-total").forEach((span) => {
        const v = parseFloat(span.textContent);
        if (!Number.isNaN(v)) yearSum += v;
      });
      const yearTotalElem = block.querySelector(".year-total-value");
      if (yearTotalElem) yearTotalElem.textContent = yearSum.toString();
    });

    if (totalPlanned) totalPlanned.textContent = grandTotal.toString();

    updateGPA();
    updatePlanStatus();
  }

  function updateGPA() {
    let totalQualityPoints = 0;
    let totalGradedCredits = 0;

    document.querySelectorAll(".semester-table").forEach((table) => {
      let semQP = 0;
      let semCredits = 0;

      table.querySelectorAll(".course-row").forEach((row) => {
        const creditInput = row.querySelector(".credit-input");
        const gradeSelect = row.querySelector(".grade-select");
        if (!creditInput || !gradeSelect) return;
        const credits = parseFloat(creditInput.value);
        const grade = gradeSelect.value;

        if (!isNaN(credits) && credits > 0 && grade && GRADE_POINTS[grade] !== undefined) {
          const qp = credits * GRADE_POINTS[grade];
          semQP += qp;
          semCredits += credits;
          totalQualityPoints += qp;
          totalGradedCredits += credits;
        }
      });

      const semGpaElem = table.querySelector(".semester-gpa");
      if (semGpaElem) {
        semGpaElem.textContent =
          semCredits > 0 ? (semQP / semCredits).toFixed(2) : "--";
      }
    });

    if (gpaValue) {
      gpaValue.textContent =
        totalGradedCredits > 0
          ? (totalQualityPoints / totalGradedCredits).toFixed(2)
          : "--";
    }

    if (gpaSummary) {
      gpaSummary.textContent =
        totalGradedCredits > 0
          ? `Based on ${totalGradedCredits} graded credits`
          : "Enter grades to calculate GPA";
    }
  }

  function updatePlanStatus() {
    if (!planStatus) return;
    const anyContent = Array.from(
      document.querySelectorAll(".year-grid .course-input")
    ).some((input) => input.value.trim());

    if (anyContent) {
      planStatus.hidden = true;
    } else {
      planStatus.hidden = false;
      planStatus.textContent =
        "Your plan is empty. Type courses directly into any semester, or build a weekly schedule on the Scheduling page and export it here.";
    }
  }

  // ==========================================
  // 5. IMPORT FROM SCHEDULING PAGE
  // ==========================================

  function importSchedule() {
    const exportData = readStoredJSON(STORAGE_KEYS.EXPORT);
    if (!exportData) return;

    removeStored(STORAGE_KEYS.EXPORT);

    const semesterId = exportData.semester;
    const courses = Array.isArray(exportData.courses) ? exportData.courses : [];

    const semesterElem = document.querySelector(
      `.semester[data-semester="${semesterId}"]`
    );
    if (!semesterElem || courses.length === 0) {
      console.error("Could not import schedule:", semesterId);
      return;
    }

    const existingNames = semesterCourseNames(semesterElem);
    let imported = 0;
    let skipped = 0;

    courses.forEach((course) => {
      const name = (course.name || "").trim();
      if (!name) return;
      if (existingNames.includes(name.toLowerCase())) {
        skipped++;
        return;
      }
      const row = firstEmptyRow(semesterElem);
      setRow(row, { name, credits: course.credits, grade: "" });
      existingNames.push(name.toLowerCase());
      imported++;
    });

    updateSemesterAndYearTotals();
    savePlan();

    const label = semesterDisplayName(semesterId);
    if (imported > 0) {
      let message = `Imported ${imported} course${imported === 1 ? "" : "s"} into ${label}.`;
      if (skipped > 0) {
        message += ` ${skipped} already in the plan ${skipped === 1 ? "was" : "were"} skipped.`;
      }
      message += " Add grades anytime to track GPA.";
      showToast(message, { type: "success", duration: 7000 });
    } else if (skipped > 0) {
      showToast(`All ${skipped} exported courses are already in ${label}.`, {
        duration: 6000,
      });
    }

    semesterElem.scrollIntoView({ behavior: "smooth", block: "center" });
    semesterElem.classList.add("import-highlight");
    setTimeout(() => {
      semesterElem.classList.remove("import-highlight");
    }, 2500);
  }

  // ==========================================
  // 6. SAVE & LOAD
  // ==========================================

  function collectPlanFromDOM() {
    const planData = emptyPlanData();
    planData.major = majorSelect ? majorSelect.value : "";

    document.querySelectorAll(".year-grid .semester").forEach((semesterElem) => {
      const semesterId = semesterElem.dataset.semester;
      if (!planData.semesters[semesterId]) return;
      semesterElem.querySelectorAll(".course-row").forEach((row) => {
        if (!rowHasContent(row)) return;
        planData.semesters[semesterId].push({
          name: row.querySelector(".course-input").value.trim(),
          credits: row.querySelector(".credit-input").value,
          grade: row.querySelector(".grade-select").value,
        });
      });
    });

    document
      .querySelectorAll(".requirements input:checked")
      .forEach((checkbox) => {
        const span = checkbox.nextElementSibling;
        if (span) planData.checkedReqs.push(span.textContent);
      });

    return planData;
  }

  function savePlan() {
    savePlanData(collectPlanFromDOM());
  }

  function loadPlan(planData) {
    if (!planData) {
      updateReqProgress();
      updateSemesterAndYearTotals();
      return;
    }

    if (majorSelect && planData.major) {
      majorSelect.value = planData.major;
      renderMajorRequirements(planData.major);
    }

    if (Array.isArray(planData.checkedReqs) && planData.checkedReqs.length > 0) {
      document.querySelectorAll(".requirements label").forEach((label) => {
        const span = label.querySelector("span");
        const checkbox = label.querySelector("input");
        if (span && checkbox && planData.checkedReqs.includes(span.textContent)) {
          checkbox.checked = true;
        }
      });
    }

    updateReqProgress();
    updateSemesterAndYearTotals();
  }

  // ==========================================
  // 7. ROW ACTIONS (move / clear) + AUTO-SAVE
  // ==========================================

  const planMain = document.querySelector(".plan-main");

  if (planMain) {
    // Typing in inputs: totals + save
    planMain.addEventListener("input", (e) => {
      if (
        e.target.matches(".course-input") ||
        e.target.matches(".credit-input")
      ) {
        updateSemesterAndYearTotals();
        savePlan();
      }
    });

    planMain.addEventListener("change", (e) => {
      // Grade selection
      if (e.target.matches(".grade-select")) {
        updateSemesterAndYearTotals();
        savePlan();
        return;
      }

      // Move course to another semester
      if (e.target.matches(".row-move")) {
        const moveSelect = e.target;
        const targetId = moveSelect.value;
        moveSelect.value = "";
        if (!targetId) return;

        const row = moveSelect.closest(".course-row");
        const sourceSemester = moveSelect.closest(".semester");
        const targetSemester = document.querySelector(
          `.semester[data-semester="${targetId}"]`
        );
        if (!row || !targetSemester || !rowHasContent(row)) return;

        const course = {
          name: row.querySelector(".course-input").value.trim(),
          credits: row.querySelector(".credit-input").value,
          grade: row.querySelector(".grade-select").value,
        };

        const targetRow = firstEmptyRow(targetSemester);
        setRow(targetRow, course);

        // Extra rows disappear when their class moves out;
        // default slots stay as a blank slot.
        if (isExtraRow(row)) {
          row.remove();
        } else {
          clearRow(row);
        }

        updateSemesterAndYearTotals();
        savePlan();
        showToast(
          `Moved ${course.name || "course"} to ${semesterDisplayName(targetId)}.`,
          { type: "success" }
        );
      }
    });

    planMain.addEventListener("click", (e) => {
      // Remove class: extra rows are removed entirely, default slots
      // are cleared back to a blank slot.
      if (e.target.matches(".row-clear")) {
        const row = e.target.closest(".course-row");
        if (!row) return;
        if (isExtraRow(row)) {
          row.remove();
        } else if (rowHasContent(row)) {
          clearRow(row);
        } else {
          return;
        }
        updateSemesterAndYearTotals();
        savePlan();
        return;
      }

      // Explicitly add one row and focus its class-name field
      if (e.target.matches(".add-class-btn")) {
        const semesterElem = e.target.closest(".semester");
        if (!semesterElem) return;
        const row = addRow(semesterElem);
        row.querySelector(".course-input").focus();
      }
    });
  }

  if (reqContainer) {
    reqContainer.addEventListener("change", (e) => {
      if (e.target.matches("input[type='checkbox']")) {
        updateReqProgress();
        savePlan();
      }
    });
  }

  if (majorSelect) {
    majorSelect.addEventListener("change", (e) => {
      renderMajorRequirements(e.target.value);
      savePlan();
    });
  }

  // ==========================================
  // 8. RESET
  // ==========================================

  if (resetPlanBtn) {
    resetPlanBtn.addEventListener("click", () => {
      if (
        !confirm(
          "Delete your 4-year plan, grades, and requirement checkmarks? Saved weekly schedules on the Scheduling page are not affected. This cannot be undone."
        )
      ) {
        return;
      }

      removeStored(STORAGE_KEYS.PLAN);

      renderGrid(null);

      document
        .querySelectorAll(".requirements input[type='checkbox']")
        .forEach((cb) => {
          cb.checked = false;
        });

      if (majorSelect) {
        majorSelect.value = "";
        renderMajorRequirements("");
      }

      updateReqProgress();
      updateSemesterAndYearTotals();
      showToast("4-year plan reset.", { type: "success" });
    });
  }

  // ==========================================
  // 9. INITIALIZATION
  // ==========================================

  const planData = loadPlanData();
  renderGrid(planData);
  updatePlanStatus();

  fetch("project/data/majors.json")
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      majorsData = Array.isArray(data) ? data : [];
      populateMajorDropdown();
      loadPlan(planData);
      importSchedule();
    })
    .catch((error) => {
      console.error("Error loading majors:", error);
      if (majorReqList) {
        majorReqList.innerHTML =
          '<li class="empty">Could not load major data. Refresh to try again.</li>';
      }
      // Still restore the user's plan grid even if majors fail to load
      loadPlan(planData);
      importSchedule();
    });
});
