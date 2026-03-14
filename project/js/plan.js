document.addEventListener("DOMContentLoaded", () => {
  // ==========================================
  // 1. SETUP VARIABLES
  // ==========================================
  const majorSelect = document.getElementById("major-select");
  const majorReqList = document.getElementById("major-req-list");
  const reqContainer = document.querySelector(".requirements");
  const reqProgress = document.querySelector(".req-progress");
  const resetPlanBtn = document.getElementById("reset-plan-btn");
  const gpaValue = document.getElementById("gpa-value");
  const gpaSummary = document.getElementById("gpa-summary");

  let majorsData = [];

  // GPA scale
  const gradePoints = {
    "A": 4.0, "A-": 3.67,
    "B+": 3.33, "B": 3.0, "B-": 2.67,
    "C+": 2.33, "C": 2.0, "C-": 1.67,
    "D+": 1.33, "D": 1.0, "D-": 0.67,
    "F": 0.0
  };

  // ==========================================
  // 2. GRID GENERATION
  // ==========================================

  function renderGrid() {
    const gridContainer = document.querySelector(".year-grid");
    if (!gridContainer) return;

    const years = ["Freshman", "Sophomore", "Junior", "Senior"];
    const semesters = ["Fall", "Spring"];
    const rowsPerSemester = 6;

    let html = "";

    years.forEach((year) => {
      html += `
        <section class="year-block">
          <h3>${year} Year</h3>
          <div class="semesters">`;

      semesters.forEach((sem) => {
        const semesterId = `${year.toLowerCase()}-${sem.toLowerCase()}`;
        html += `
            <div class="semester" data-semester="${semesterId}">
              <h4>${sem}</h4>
              <div class="semester-table">
                <div class="semester-header">
                  <span>Course</span>
                  <span>Credits</span>
                  <span>Grade</span>
                </div>`;

        for (let i = 0; i < rowsPerSemester; i++) {
          html += `
                <div class="course-row">
                  <input class="course-input" placeholder="Course" />
                  <input class="credit-input" type="number" min="0" step="0.5" placeholder="0" />
                  <select class="grade-select">
                    <option value="">--</option>
                    <option value="A">A</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B">B</option>
                    <option value="B-">B-</option>
                    <option value="C+">C+</option>
                    <option value="C">C</option>
                    <option value="C-">C-</option>
                    <option value="D+">D+</option>
                    <option value="D">D</option>
                    <option value="D-">D-</option>
                    <option value="F">F</option>
                  </select>
                </div>`;
        }

        html += `
                <div class="semester-footer">
                  <span>Total Credits</span>
                  <span class="semester-total">0</span>
                  <span class="semester-gpa">--</span>
                </div>
              </div>
            </div>`;
      });

      html += `
          </div>
          <div class="year-total-row">
            <span>${year} Year Total</span>
            <span class="year-total-value">0</span>
          </div>
        </section>`;
    });

    gridContainer.innerHTML = html;
  }

  // ==========================================
  // 3. CORE FUNCTIONS
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
      majorReqList.innerHTML =
        '<li class="empty">Choose a major to see its classes.</li>';
      updateReqProgress();
      return;
    }

    selectedMajor.requirements.forEach((reqName) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <label>
          <input type="checkbox" />
          <span>${reqName}</span>
        </label>
      `;
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

  function updateSemesterAndYearTotals() {
    // 1. Semester Totals
    document.querySelectorAll(".semester-table").forEach((table) => {
      let sum = 0;
      table.querySelectorAll(".credit-input").forEach((input) => {
        const value = parseFloat(input.value);
        if (!Number.isNaN(value)) sum += value;
      });
      const totalElem = table.querySelector(".semester-total");
      if (totalElem) totalElem.textContent = sum.toString();
    });

    // 2. Year Totals
    document.querySelectorAll(".year-block").forEach((block) => {
      let yearSum = 0;
      block.querySelectorAll(".semester-total").forEach((span) => {
        const v = parseFloat(span.textContent);
        if (!Number.isNaN(v)) yearSum += v;
      });
      const yearTotalElem = block.querySelector(".year-total-value");
      if (yearTotalElem) yearTotalElem.textContent = yearSum.toString();
    });

    // 3. Update GPA
    updateGPA();
  }

  // ==========================================
  // 4. GPA CALCULATOR
  // ==========================================

  function updateGPA() {
    let totalQualityPoints = 0;
    let totalGradedCredits = 0;

    // Also compute per-semester GPA
    document.querySelectorAll(".semester-table").forEach((table) => {
      let semQP = 0;
      let semCredits = 0;

      const rows = table.querySelectorAll(".course-row");
      rows.forEach((row) => {
        const creditInput = row.querySelector(".credit-input");
        const gradeSelect = row.querySelector(".grade-select");
        const credits = parseFloat(creditInput.value);
        const grade = gradeSelect.value;

        if (!isNaN(credits) && credits > 0 && grade && gradePoints[grade] !== undefined) {
          const qp = credits * gradePoints[grade];
          semQP += qp;
          semCredits += credits;
          totalQualityPoints += qp;
          totalGradedCredits += credits;
        }
      });

      const semGpaElem = table.querySelector(".semester-gpa");
      if (semGpaElem) {
        semGpaElem.textContent = semCredits > 0
          ? (semQP / semCredits).toFixed(2)
          : "--";
      }
    });

    // Overall GPA
    if (gpaValue) {
      gpaValue.textContent = totalGradedCredits > 0
        ? (totalQualityPoints / totalGradedCredits).toFixed(2)
        : "--";
    }

    if (gpaSummary) {
      if (totalGradedCredits > 0) {
        gpaSummary.textContent = `Based on ${totalGradedCredits} graded credits`;
      } else {
        gpaSummary.textContent = "Enter grades to calculate GPA";
      }
    }
  }

  // ==========================================
  // 5. IMPORT FROM SCHEDULING PAGE
  // ==========================================

  function importSchedule() {
    const exportJSON = localStorage.getItem("bc_career_planner_export");
    if (!exportJSON) return;

    const exportData = JSON.parse(exportJSON);
    const semesterId = exportData.semester;
    const courses = exportData.courses;

    const semesterElem = document.querySelector(
      `.semester[data-semester="${semesterId}"]`
    );
    if (!semesterElem) {
      console.error("Could not find semester:", semesterId);
      return;
    }

    const courseRows = semesterElem.querySelectorAll(".course-row");

    courses.forEach((course, index) => {
      if (index < courseRows.length) {
        const row = courseRows[index];
        const courseInput = row.querySelector(".course-input");
        const creditInput = row.querySelector(".credit-input");

        if (courseInput) courseInput.value = course.name;
        if (creditInput) creditInput.value = course.credits;
      }
    });

    updateSemesterAndYearTotals();
    savePlan();

    localStorage.removeItem("bc_career_planner_export");

    semesterElem.scrollIntoView({ behavior: "smooth", block: "center" });
    semesterElem.style.outline = "3px solid #8e0c03";
    setTimeout(() => {
      semesterElem.style.outline = "none";
    }, 2000);
  }

  // ==========================================
  // 6. SAVE & LOAD LOGIC
  // ==========================================

  function savePlan() {
    const planData = {
      major: majorSelect ? majorSelect.value : "",
      grid: [],
      grades: [],
      checkedReqs: [],
    };

    // Save Grid Inputs (course name + credits)
    document.querySelectorAll(".year-grid .course-input, .year-grid .credit-input").forEach((input) => {
      planData.grid.push(input.value);
    });

    // Save Grades
    document.querySelectorAll(".year-grid .grade-select").forEach((select) => {
      planData.grades.push(select.value);
    });

    // Save Checkboxes
    document
      .querySelectorAll(".requirements input:checked")
      .forEach((checkbox) => {
        const label = checkbox.nextElementSibling.textContent;
        planData.checkedReqs.push(label);
      });

    localStorage.setItem("bc_career_planner_data", JSON.stringify(planData));
  }

  function loadPlan() {
    const savedJSON = localStorage.getItem("bc_career_planner_data");
    if (!savedJSON) return;

    const planData = JSON.parse(savedJSON);

    // Restore Grid (course + credit inputs)
    const courseInputs = document.querySelectorAll(".year-grid .course-input");
    const creditInputs = document.querySelectorAll(".year-grid .credit-input");
    let gridIndex = 0;
    for (let i = 0; i < courseInputs.length; i++) {
      if (planData.grid[gridIndex] !== undefined) courseInputs[i].value = planData.grid[gridIndex];
      gridIndex++;
      if (planData.grid[gridIndex] !== undefined) creditInputs[i].value = planData.grid[gridIndex];
      gridIndex++;
    }

    // Restore Grades
    if (planData.grades) {
      const gradeSelects = document.querySelectorAll(".year-grid .grade-select");
      planData.grades.forEach((value, index) => {
        if (gradeSelects[index]) gradeSelects[index].value = value;
      });
    }

    // Restore Major
    if (majorSelect && planData.major) {
      majorSelect.value = planData.major;
      renderMajorRequirements(planData.major);
    }

    // Restore Checkboxes
    if (planData.checkedReqs && planData.checkedReqs.length > 0) {
      document.querySelectorAll(".requirements label").forEach((label) => {
        const span = label.querySelector("span");
        const checkbox = label.querySelector("input");
        if (
          span &&
          checkbox &&
          planData.checkedReqs.includes(span.textContent)
        ) {
          checkbox.checked = true;
        }
      });
    }

    updateReqProgress();
    updateSemesterAndYearTotals();
  }

  // ==========================================
  // 7. RESET LOGIC
  // ==========================================

  if (resetPlanBtn) {
    resetPlanBtn.addEventListener("click", () => {
      if (
        !confirm(
          "Are you sure you want to delete your plan? This cannot be undone."
        )
      ) {
        return;
      }

      localStorage.removeItem("bc_career_planner_data");

      document.querySelectorAll(".year-grid input").forEach((input) => {
        input.value = "";
      });

      document.querySelectorAll(".year-grid .grade-select").forEach((select) => {
        select.value = "";
      });

      document
        .querySelectorAll(".requirements input[type='checkbox']")
        .forEach((cb) => {
          cb.checked = false;
        });

      if (majorSelect) {
        majorSelect.value = "";
        renderMajorRequirements("");
      }

      document
        .querySelectorAll(".semester-total")
        .forEach((el) => (el.textContent = "0"));
      document
        .querySelectorAll(".semester-gpa")
        .forEach((el) => (el.textContent = "--"));
      document
        .querySelectorAll(".year-total-value")
        .forEach((el) => (el.textContent = "0"));

      if (gpaValue) gpaValue.textContent = "--";
      if (gpaSummary) gpaSummary.textContent = "Enter grades to calculate GPA";

      updateReqProgress();
      updateSemesterAndYearTotals();
    });
  }

  // ==========================================
  // 8. INITIALIZATION
  // ==========================================

  // 1. GENERATE THE GRID FIRST
  renderGrid();

  // 2. Attach Listeners (now that elements exist)
  if (majorSelect) {
    majorSelect.addEventListener("change", (e) =>
      renderMajorRequirements(e.target.value)
    );
  }
  if (reqContainer) {
    reqContainer.addEventListener("change", (e) => {
      if (e.target.matches("input[type='checkbox']")) updateReqProgress();
    });
  }

  // Attach listeners to inputs and grade selects
  document.querySelectorAll(".credit-input").forEach((input) => {
    input.addEventListener("input", updateSemesterAndYearTotals);
  });

  document.querySelectorAll(".grade-select").forEach((select) => {
    select.addEventListener("change", () => {
      updateGPA();
      savePlan();
    });
  });

  // Attach Save Listeners
  const plannerContainer = document.querySelector(".planner-container");
  if (plannerContainer) plannerContainer.addEventListener("input", savePlan);
  if (reqContainer) reqContainer.addEventListener("change", savePlan);

  // 3. Fetch Data & Load Save
  fetch("project/data/majors.json")
    .then((response) => response.json())
    .then((data) => {
      majorsData = data;
      populateMajorDropdown();
      loadPlan();
      importSchedule();
    })
    .catch((error) => {
      console.error("Error loading majors:", error);
      majorReqList.innerHTML = '<li class="error">Failed to load data.</li>';
    });
});
