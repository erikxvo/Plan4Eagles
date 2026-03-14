document.addEventListener("DOMContentLoaded", () => {
  const majorListContainer = document.getElementById("major-list");
  const suggestionsContainer = document.getElementById("suggestions");
  const statCredits = document.getElementById("stat-credits");
  const statReqs = document.getElementById("stat-reqs");

  // 1. Get the User's Major from Local Storage (set in the 4-Year Plan)
  const savedData = localStorage.getItem("bc_career_planner_data");
  let userMajorId = null;
  let planData = null;

  if (savedData) {
    try {
      planData = JSON.parse(savedData);
      if (planData.major) {
        userMajorId = planData.major;
      }
    } catch (e) {
      console.error("Error parsing saved data", e);
    }
  }

  // Calculate quick stats from saved plan data
  if (planData) {
    // Count total planned credits from the grid
    let totalCredits = 0;
    if (planData.grid && planData.grid.length > 0) {
      // Grid inputs are stored flat: each semester has 12 inputs (6 course + 6 credit)
      // Credit inputs are at odd positions within each semester block
      planData.grid.forEach((value, index) => {
        const posInSemester = index % 12;
        if (posInSemester % 2 === 1) {
          const num = parseFloat(value);
          if (!isNaN(num)) totalCredits += num;
        }
      });
    }
    if (statCredits) statCredits.textContent = totalCredits > 0 ? totalCredits : "--";

    // Count checked requirements
    const reqCount = planData.checkedReqs ? planData.checkedReqs.length : 0;
    if (statReqs) statReqs.textContent = reqCount > 0 ? reqCount : "--";
  }

  // Handle case where no major is selected yet
  if (!userMajorId) {
    majorListContainer.innerHTML = '<li>No major selected yet.</li>';
    suggestionsContainer.innerHTML =
      "<li>Go to the <a href='plan.html' style='color:#8e0c03; font-weight:600;'>4-Year Plan</a> to select a major.</li>";
    return;
  }

  // 2. Fetch Data and Render
  fetch("project/data/majors.json")
    .then((response) => response.json())
    .then((allMajors) => {
      renderDashboard(allMajors, userMajorId);
    })
    .catch((err) => console.error("Failed to load majors:", err));

  function renderDashboard(allMajors, selectedId) {
    majorListContainer.innerHTML = "";
    suggestionsContainer.innerHTML = "";

    const userMajor = allMajors.find((major) => major.id === selectedId);

    if (!userMajor) {
      majorListContainer.innerHTML = "<li>Major data not found.</li>";
      return;
    }

    // Render Major Name
    const li = document.createElement("li");
    li.innerHTML = `<strong>${userMajor.name}</strong>`;
    majorListContainer.appendChild(li);

    // Render Suggestions
    if (userMajor.suggestions && userMajor.suggestions.length > 0) {
      userMajor.suggestions.forEach((suggestion) => {
        const suggLi = document.createElement("li");
        suggLi.innerHTML = `<strong>${suggestion.name}</strong><small>${suggestion.reason}</small>`;
        suggestionsContainer.appendChild(suggLi);
      });
    } else {
      suggestionsContainer.innerHTML =
        "<li>No specific suggestions for this major.</li>";
    }
  }
});

// Navigation helper
window.goTo = function (url) {
  window.location.href = url;
};
