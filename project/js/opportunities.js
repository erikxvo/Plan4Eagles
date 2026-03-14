document.addEventListener("DOMContentLoaded", () => {
  const oppList = document.getElementById("opp-list");
  const typeFilter = document.getElementById("type-filter");
  const majorFilterToggle = document.getElementById("major-filter-toggle");
  const handshakeBtn = document.getElementById("handshake-btn");

  let allOpportunities = [];
  let userMajorId = null;

  // Get user major from localStorage
  const savedData = localStorage.getItem("bc_career_planner_data");
  if (savedData) {
    try {
      const parsed = JSON.parse(savedData);
      if (parsed.major) userMajorId = parsed.major;
    } catch (e) {
      console.error("Error parsing saved data", e);
    }
  }

  // Customize Handshake button based on major
  if (userMajorId) {
    const majorMap = {
      "cs-bs": "Computer Science",
      "cs-ba": "Computer Science",
      "math-ba": "Mathematics",
      "math-bs": "Mathematics",
      "econ-ba": "Economics",
      "biology-ba": "Biology",
      "psych-ba": "Psychology",
      "poli-sci-ba": "Political Science",
    };
    if (majorMap[userMajorId]) {
      const searchTerm = encodeURIComponent(majorMap[userMajorId]);
      handshakeBtn.href = `https://app.joinhandshake.com/stu/postings?query=${searchTerm}`;
    }
  } else {
    // If no major selected, disable major filter
    majorFilterToggle.checked = false;
  }

  // Load opportunities data
  fetch("project/data/opportunities.json")
    .then((res) => res.json())
    .then((data) => {
      allOpportunities = data;
      renderOpportunities();
    })
    .catch((err) => {
      console.error("Failed to load opportunities:", err);
      oppList.innerHTML = '<p class="no-results">Failed to load opportunities.</p>';
    });

  // Filter listeners
  typeFilter.addEventListener("change", renderOpportunities);
  majorFilterToggle.addEventListener("change", renderOpportunities);

  function renderOpportunities() {
    const selectedType = typeFilter.value;
    const filterByMajor = majorFilterToggle.checked;

    let filtered = allOpportunities;

    // Filter by type
    if (selectedType) {
      filtered = filtered.filter((opp) => opp.type === selectedType);
    }

    // Filter by major
    if (filterByMajor && userMajorId) {
      filtered = filtered.filter((opp) => opp.majors.includes(userMajorId));
    }

    // Render
    if (filtered.length === 0) {
      oppList.innerHTML = '<p class="no-results">No opportunities match your filters. Try changing the filter settings.</p>';
      return;
    }

    oppList.innerHTML = "";

    filtered.forEach((opp) => {
      const card = document.createElement("div");
      card.className = "opp-card fade-in";

      const postedDate = new Date(opp.posted).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });

      card.innerHTML = `
        <div class="opp-card-body">
          <h3 class="opp-card-title">${opp.title}</h3>
          <p class="opp-card-company">${opp.company}</p>
          <p class="opp-card-desc">${opp.description}</p>
          <div class="opp-card-meta">
            <span class="opp-tag opp-tag-type">${opp.type}</span>
            <span class="opp-tag opp-tag-location">${opp.location}</span>
            <span class="opp-tag opp-tag-date">Posted ${postedDate}</span>
          </div>
        </div>
        <div class="opp-card-action">
          <a href="${opp.url}" target="_blank" class="opp-apply-btn">View</a>
        </div>
      `;

      oppList.appendChild(card);
    });
  }
});
