/* ==========================================
   OPPORTUNITY HUB - Plan4Eagles
   Curated official BC resources, grouped into
   Jobs & Internships / Research / On-Campus /
   Student Orgs. Depends on storage.js + ui.js.
   ========================================== */

document.addEventListener("DOMContentLoaded", () => {
  const oppList = document.getElementById("opp-list");
  const featuredCard = document.getElementById("featured-card");
  const tabs = Array.from(document.querySelectorAll(".opp-tab"));
  const majorFilterWrap = document.getElementById("major-filter-wrap");
  const majorFilterToggle = document.getElementById("major-filter-toggle");
  const majorFilterText = document.getElementById("major-filter-text");
  const lastVerifiedEl = document.getElementById("last-verified");

  let resourcesData = { lastVerified: null, handshakeSearchTerms: {}, resources: [] };
  let majorsData = [];
  let activeCategory = "jobs";

  // Selected major comes from the same shared plan data used everywhere else
  const planData = loadPlanData();
  const userMajorId = planData && planData.major ? planData.major : null;

  if (!userMajorId && majorFilterWrap) {
    // No major selected: show everything and explain how to personalize
    majorFilterToggle.checked = false;
    majorFilterToggle.disabled = true;
    majorFilterText.textContent =
      "Select a major in the 4-Year Plan to personalize suggestions";
  }

  // Load curated resources + majors (for display names)
  Promise.all([
    fetch("project/data/resources.json").then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }),
    fetch("project/data/majors.json")
      .then((res) => (res.ok ? res.json() : []))
      .catch(() => []),
  ])
    .then(([resources, majors]) => {
      resourcesData = resources || resourcesData;
      majorsData = Array.isArray(majors) ? majors : [];

      if (lastVerifiedEl && resourcesData.lastVerified) {
        const date = new Date(`${resourcesData.lastVerified}T12:00:00`);
        if (!isNaN(date)) {
          lastVerifiedEl.textContent = `Links last verified ${date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}. `;
        }
      }

      render();
    })
    .catch((err) => {
      console.error("Failed to load resources:", err);
      if (oppList) {
        oppList.innerHTML = "";
        const p = document.createElement("p");
        p.className = "no-results";
        p.textContent = "Could not load resources. Refresh the page to try again.";
        oppList.appendChild(p);
      }
    });

  // Tab switching
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      activeCategory = tab.dataset.category;
      tabs.forEach((t) => {
        const isActive = t === tab;
        t.classList.toggle("is-active", isActive);
        t.setAttribute("aria-selected", String(isActive));
      });
      render();
    });
  });

  if (majorFilterToggle) {
    majorFilterToggle.addEventListener("change", render);
  }

  function majorName(majorId) {
    const major = majorsData.find((m) => m.id === majorId);
    return major ? major.name : null;
  }

  function render() {
    renderFeaturedCard();
    renderResourceCards();
  }

  // ---------- Featured Handshake card (Jobs tab only) ----------

  function renderFeaturedCard() {
    if (!featuredCard) return;
    featuredCard.innerHTML = "";
    if (activeCategory !== "jobs") return;

    const card = document.createElement("div");
    card.className = "featured-card";

    const title = document.createElement("h3");
    title.textContent = "Search jobs and internships in Handshake";
    card.appendChild(title);

    const desc = document.createElement("p");
    desc.className = "featured-desc";
    desc.textContent =
      "Handshake is Boston College's main platform for jobs and internships available to BC students. Log in with your BC credentials to browse current postings.";
    card.appendChild(desc);

    // Suggested searches for the user's major
    const terms = userMajorId
      ? resourcesData.handshakeSearchTerms?.[userMajorId] || []
      : [];

    if (terms.length > 0) {
      const label = document.createElement("p");
      label.className = "featured-label";
      const name = majorName(userMajorId);
      label.textContent = name
        ? `Suggested searches for ${name}:`
        : "Suggested searches:";
      card.appendChild(label);

      const chips = document.createElement("div");
      chips.className = "search-chips";
      terms.forEach((term) => {
        const chip = document.createElement("a");
        chip.className = "search-chip";
        chip.href = `https://app.joinhandshake.com/stu/postings?query=${encodeURIComponent(term)}`;
        chip.target = "_blank";
        chip.rel = "noopener noreferrer";
        chip.textContent = term;
        chips.appendChild(chip);
      });
      card.appendChild(chips);
    } else {
      const hint = document.createElement("p");
      hint.className = "hint-text";
      const link = document.createElement("a");
      link.href = "plan.html";
      link.className = "inline-link";
      link.textContent = "Select a major in the 4-Year Plan";
      hint.appendChild(link);
      hint.appendChild(
        document.createTextNode(" to get suggested search terms here.")
      );
      card.appendChild(hint);
    }

    const action = document.createElement("a");
    action.className = "btn-primary featured-action";
    action.href = "https://app.joinhandshake.com/stu/postings";
    action.target = "_blank";
    action.rel = "noopener noreferrer";
    action.textContent = "Open Handshake ↗";
    card.appendChild(action);

    const loginNote = document.createElement("p");
    loginNote.className = "disclaimer-text";
    loginNote.textContent = "Requires BC login.";
    card.appendChild(loginNote);

    featuredCard.appendChild(card);
  }

  // ---------- Resource cards ----------

  function renderResourceCards() {
    if (!oppList) return;

    const filterByMajor = Boolean(
      majorFilterToggle && majorFilterToggle.checked && userMajorId
    );

    const filtered = (resourcesData.resources || []).filter((resource) => {
      if (resource.category !== activeCategory) return false;
      if (resource.featured) return false; // rendered separately
      const relevant = Array.isArray(resource.relevantMajors)
        ? resource.relevantMajors
        : [];
      if (filterByMajor && relevant.length > 0 && !relevant.includes(userMajorId)) {
        return false;
      }
      return true;
    });

    oppList.innerHTML = "";

    if (filtered.length === 0) {
      const p = document.createElement("p");
      p.className = "no-results";
      p.textContent = filterByMajor
        ? "No resources in this category are tagged for your major. Uncheck the major filter to see everything."
        : "No resources in this category yet.";
      oppList.appendChild(p);
      return;
    }

    filtered.forEach((resource) => {
      oppList.appendChild(buildResourceCard(resource));
    });
  }

  function buildResourceCard(resource) {
    const card = document.createElement("div");
    card.className = "opp-card fade-in";

    const body = document.createElement("div");
    body.className = "opp-card-body";

    const title = document.createElement("h3");
    title.className = "opp-card-title";
    title.textContent = resource.name;
    body.appendChild(title);

    const desc = document.createElement("p");
    desc.className = "opp-card-desc";
    desc.textContent = resource.description;
    body.appendChild(desc);

    const meta = document.createElement("div");
    meta.className = "opp-card-meta";

    const sourceTag = document.createElement("span");
    sourceTag.className = "opp-tag opp-tag-source";
    sourceTag.textContent = resource.source;
    meta.appendChild(sourceTag);

    if (resource.loginRequired) {
      const loginTag = document.createElement("span");
      loginTag.className = "opp-tag opp-tag-login";
      loginTag.textContent = "BC login required";
      meta.appendChild(loginTag);
    }

    const relevant = Array.isArray(resource.relevantMajors)
      ? resource.relevantMajors
      : [];
    if (relevant.length > 0) {
      const majorsTag = document.createElement("span");
      majorsTag.className = "opp-tag opp-tag-majors";
      const names = relevant.map((id) => majorName(id)).filter(Boolean);
      majorsTag.textContent = names.length > 0 ? names.join(", ") : "Selected majors";
      meta.appendChild(majorsTag);
    }

    body.appendChild(meta);
    card.appendChild(body);

    const action = document.createElement("div");
    action.className = "opp-card-action";
    const link = document.createElement("a");
    link.className = "opp-visit-btn";
    link.href = resource.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Visit ↗";
    link.setAttribute("aria-label", `Visit ${resource.name} (opens in a new tab)`);
    action.appendChild(link);
    card.appendChild(action);

    return card;
  }
});
