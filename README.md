# Plan4Eagles

An academic planning platform for Boston College students. Browse real BC course sections, build a conflict-checked weekly schedule, export classes into a 4-year degree plan, track GPA and degree requirements, and find official BC resources for jobs, research, campus work, and student organizations.

**Live site:** https://erikxvo.github.io/Plan4Eagles/

> Plan4Eagles is an independent student project and is **not affiliated with Boston College**. Always confirm course availability, registration details, and graduation requirements through BC's official systems and your academic advisor.

## Features

- **Scheduling** — search ~4,000 real BC course sections by code, title, or professor; filter by term and department; add classes to a visual weekly calendar with automatic time-conflict detection. Asynchronous, by-arrangement, and TBA courses are listed honestly in a separate "no fixed meeting time" section instead of being hidden or given fake times.
- **4-Year Planner** — plan all eight semesters with per-semester and total credits, move or remove planned classes, and track BC Core and major requirements with checklists. Semesters grow as you add courses (no fixed row limit).
- **GPA Calculator** — built into the planner: enter credits and grades to see per-semester and cumulative GPA on BC's 4.0 scale.
- **Scheduler → Planner export** — send a semester's scheduled classes into the matching semester of the 4-year plan, with duplicate detection.
- **Opportunity Hub** — curated, verified links to official BC resources (Career Center/Handshake, undergraduate research and fellowships, student employment, MyBC organizations), with Handshake search suggestions tailored to your selected major.
- **Dashboard** — personalized summary of your major, planned credits, scheduled credits, GPA, and requirement progress, plus a suggested next step. First-time visitors get a simple guided path.

## Tech Stack

Plain HTML, CSS, and vanilla JavaScript — no framework, no build step. A Node.js scraper generates the course catalog. Deployed as a static site on GitHub Pages.

```
index.html / scheduling.html / plan.html / opportunities.html
project/
  js/       storage.js (shared localStorage utils) · ui.js (toasts) · one script per page
  style/    global.css (design tokens) · one stylesheet per page
  data/     courses.json (generated) · majors.json · resources.json
scraper/    fetch-courses.js
```

## Running Locally

The app fetches JSON data, so it must be served over HTTP (opening `index.html` via `file://` won't work):

```bash
npm install        # one-time, installs the dev server
npm start          # serves the site at http://localhost:5000
```

Any static server works, e.g. `python3 -m http.server`.

## Refreshing Course Data

```bash
npm run scrape     # or: node scraper/fetch-courses.js
```

The scraper pulls from BC's public registrar JSON endpoints (no authentication):

- `https://bcweb.bc.edu/aem/coursesfall.json`
- `https://bcweb.bc.edu/aem/coursessprg.json`
- `https://bcweb.bc.edu/aem/coursessumm.json`

It fetches whatever terms BC currently publishes (endpoints can be empty between registration periods), keeps undergraduate sections, and writes `project/data/courses.json` with a `generatedAt` timestamp, the term list, and a department-name map. The scheduling page shows the refresh date and derives its term filter from this metadata automatically.

Options: `--semester fall|spring|summer`, `--dept CSCI,MATH`, `--all-levels`.

**Schedule parsing notes:** sections are typed as `scheduled`, `async` (online asynchronous), `arranged` (by arrangement — independent studies, lessons, etc.), `tba`, or `weekend`. For sections with multiple meeting patterns (e.g. lecture + evening discussion), the pattern with the most meeting days is treated as primary and the others are preserved verbatim and shown as "Also meets: …"; conflict detection only checks the primary pattern.

## Opportunity Resources

Curated links live in `project/data/resources.json`. Each entry records its name, description, category (`jobs` / `research` / `on-campus` / `clubs`), relevant majors, source, and whether BC login is required. The file has a top-level `lastVerified` date shown on the page — update it after re-checking the links. All links point to official BC pages or Handshake; Plan4Eagles does not scrape or display private Handshake postings.

## LocalStorage

All user data stays in the browser. Keys are defined centrally in `project/js/storage.js`:

| Key | Contents |
|---|---|
| `bc_career_planner_data` | 4-year plan: `{version: 2, major, semesters: {<semester-id>: [{name, credits, grade}]}, checkedReqs}` |
| `bc_career_planner_schedule_<semester-id>` | Array of scheduled course ids (`CODE-SECTION-TERM`) for that plan semester |
| `bc_career_planner_schedule_meta` | Per-semester `{credits, courseCount, updatedAt}` summary used by the dashboard |
| `bc_career_planner_selected_semester` | Last plan semester selected on the Scheduling page |
| `bc_career_planner_export` | Transient scheduler→planner handoff; deleted after import |

Legacy (v1) plan data using a flat `grid` array is migrated to v2 automatically on first load. Corrupted or missing values are handled defensively (`readStoredJSON` falls back instead of crashing).

## Deployment

GitHub Pages serves the `main` branch root. All asset and fetch paths are relative, so the site works under the `/Plan4Eagles/` subpath. To deploy, push to `main` — no build step.

## Known Limitations

- **Degree requirements are unofficial planning templates** for eight selected programs (CS BA/BS, Math BA/BS, Economics BA, Biology BA, Psychology BA, Political Science BA). They were checked against the public BC University Catalog (June 2026) but simplify elective rules, substitutions, and concentration options. Confirm requirements with your advisor and the official catalog.
- Course availability, professors, rooms, and enrollment status change; the catalog is only as fresh as the last scraper run, and BC's spring endpoint is empty until spring registration data is published.
- Conflict detection uses each section's primary meeting pattern; additional lab/discussion meetings are displayed but not conflict-checked.
- Jobs and internships link to Handshake (BC login required) rather than showing live postings.
- Curated opportunity links need periodic re-verification (see `lastVerified` in `resources.json`).
- Data lives only in your browser's localStorage — clearing site data erases your plan; there is no account sync or export.
- The weekly calendar shows Monday–Friday; weekend sections (rare for undergrads) appear in the "no fixed meeting time" list with their real times.
