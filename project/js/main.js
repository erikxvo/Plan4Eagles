/* ==========================================
   HOME DASHBOARD - Plan4Eagles
   Depends on storage.js + ui.js (loaded first).
   ========================================== */

document.addEventListener("DOMContentLoaded", () => {
  const onboarding = document.getElementById("onboarding");
  const profileContent = document.getElementById("profile-content");
  const majorListContainer = document.getElementById("major-list");
  const suggestionsContainer = document.getElementById("suggestions");
  const nextStepEl = document.getElementById("next-step");
  const statCredits = document.getElementById("stat-credits");
  const statReqs = document.getElementById("stat-reqs");
  const statGpa = document.getElementById("stat-gpa");
  const statScheduled = document.getElementById("stat-scheduled");
  const statScheduledLabel = document.getElementById("stat-scheduled-label");

  const planData = loadPlanData();
  const scheduleMeta = readStoredJSON(STORAGE_KEYS.SCHEDULE_META, {}) || {};
  const hasSchedules = Object.keys(scheduleMeta).length > 0;

  // ---------- First-visit guided path ----------
  if (!planData && !hasSchedules) {
    if (onboarding) onboarding.hidden = false;
    if (profileContent) profileContent.hidden = true;
    return;
  }

  // ---------- Quick stats ----------
  const stats = computePlanStats(planData);

  if (statCredits) {
    statCredits.textContent = stats.totalCredits > 0 ? stats.totalCredits : "--";
  }

  if (statGpa) {
    statGpa.textContent = stats.gpa !== null ? stats.gpa.toFixed(2) : "--";
  }

  // Scheduled credits for the semester currently selected on the
  // Scheduling page (falls back to the most recently updated schedule)
  let activeSemester = null;
  try {
    activeSemester = localStorage.getItem(STORAGE_KEYS.SELECTED_SEMESTER);
  } catch (e) {
    /* storage unavailable */
  }
  if (!activeSemester || !scheduleMeta[activeSemester]) {
    let latest = null;
    Object.entries(scheduleMeta).forEach(([semester, meta]) => {
      if (!latest || (meta.updatedAt || "") > (scheduleMeta[latest].updatedAt || "")) {
        latest = semester;
      }
    });
    activeSemester = latest;
  }

  if (statScheduled && statScheduledLabel) {
    if (activeSemester && scheduleMeta[activeSemester]) {
      statScheduled.textContent = scheduleMeta[activeSemester].credits;
      statScheduledLabel.textContent = `Scheduled · ${semesterDisplayName(activeSemester)}`;
    } else {
      statScheduled.textContent = "--";
      statScheduledLabel.textContent = "Scheduled Credits";
    }
  }

  const userMajorId = planData && planData.major ? planData.major : null;
  const checkedCount =
    planData && Array.isArray(planData.checkedReqs)
      ? planData.checkedReqs.length
      : 0;

  // ---------- Next-step suggestion ----------
  if (nextStepEl) {
    let nextStep;
    if (!userMajorId) {
      nextStep = { text: "Choose your major in the 4-Year Plan.", href: "plan.html" };
    } else if (!hasSchedules) {
      nextStep = { text: "Build a weekly schedule from real BC courses.", href: "scheduling.html" };
    } else if (stats.totalCredits === 0) {
      nextStep = { text: "Export your schedule into the 4-Year Plan.", href: "scheduling.html" };
    } else {
      nextStep = { text: "Explore opportunities for your major.", href: "opportunities.html" };
    }
    const link = document.createElement("a");
    link.href = nextStep.href;
    link.className = "next-step-link";
    link.textContent = nextStep.text;
    nextStepEl.appendChild(link);
  }

  // ---------- Major name, requirement progress, suggestions ----------
  if (!userMajorId) {
    if (majorListContainer) {
      majorListContainer.innerHTML = "";
      const li = document.createElement("li");
      li.textContent = "No major selected yet.";
      majorListContainer.appendChild(li);
    }
    if (suggestionsContainer) {
      suggestionsContainer.innerHTML = "";
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = "plan.html";
      link.className = "next-step-link";
      link.textContent = "Select a major in the 4-Year Plan";
      li.appendChild(link);
      li.appendChild(document.createTextNode(" to see suggestions."));
      suggestionsContainer.appendChild(li);
    }
    if (statReqs) {
      statReqs.textContent = checkedCount > 0 ? checkedCount : "--";
    }
    return;
  }

  fetch("project/data/majors.json")
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((allMajors) => {
      renderMajorPanel(allMajors, userMajorId);
    })
    .catch((err) => {
      console.error("Failed to load majors:", err);
      if (statReqs) statReqs.textContent = checkedCount > 0 ? checkedCount : "--";
    });

  function renderMajorPanel(allMajors, selectedId) {
    const userMajor = Array.isArray(allMajors)
      ? allMajors.find((major) => major.id === selectedId)
      : null;

    if (majorListContainer) {
      majorListContainer.innerHTML = "";
      const li = document.createElement("li");
      const strong = document.createElement("strong");
      strong.textContent = userMajor ? userMajor.name : "Major data not found.";
      li.appendChild(strong);
      majorListContainer.appendChild(li);
    }

    // Requirement progress: 16 core checkboxes + the major's requirements
    if (statReqs) {
      const CORE_COUNT = 16;
      if (userMajor && Array.isArray(userMajor.requirements)) {
        const total = CORE_COUNT + userMajor.requirements.length;
        statReqs.textContent = `${checkedCount}/${total}`;
      } else {
        statReqs.textContent = checkedCount > 0 ? checkedCount : "--";
      }
    }

    if (suggestionsContainer) {
      suggestionsContainer.innerHTML = "";
      if (userMajor && Array.isArray(userMajor.suggestions) && userMajor.suggestions.length > 0) {
        userMajor.suggestions.forEach((suggestion) => {
          const li = document.createElement("li");
          const strong = document.createElement("strong");
          strong.textContent = suggestion.name;
          const small = document.createElement("small");
          small.textContent = suggestion.reason;
          li.appendChild(strong);
          li.appendChild(small);
          suggestionsContainer.appendChild(li);
        });
      } else {
        const li = document.createElement("li");
        li.textContent = "No specific suggestions for this major.";
        suggestionsContainer.appendChild(li);
      }
    }
  }
});
