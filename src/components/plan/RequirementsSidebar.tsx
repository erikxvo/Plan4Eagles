"use client";

import { usePlanStore } from "@/store/planStore";
import { useMajors } from "@/hooks/useMajors";
import GPADisplay from "./GPADisplay";

const BC_CORE_REQS = [
  "Writing", "Literature", "Arts", "Math",
  "History I", "History II", "Philosophy I", "Philosophy II",
  "Social Science", "Social Science",
  "Natural Science", "Natural Science",
  "Theology (CT)", "Theology (STT)",
  "Cultural Diversity", "Language Proficiency",
];

export default function RequirementsSidebar() {
  const { majors } = useMajors();
  const major = usePlanStore((s) => s.major);
  const checkedReqs = usePlanStore((s) => s.checkedReqs);
  const setMajor = usePlanStore((s) => s.setMajor);
  const toggleReq = usePlanStore((s) => s.toggleReq);
  const resetPlan = usePlanStore((s) => s.resetPlan);

  const selectedMajor = majors.find((m) => m.id === major);

  // Count all checkboxes
  const allReqs = [...BC_CORE_REQS, ...(selectedMajor?.requirements || [])];
  const totalReqs = allReqs.length;
  const doneReqs = checkedReqs.length;
  const pct = totalReqs > 0 ? Math.round((doneReqs / totalReqs) * 100) : 0;

  const handleReset = () => {
    if (confirm("Are you sure you want to delete your plan? This cannot be undone.")) {
      resetPlan();
    }
  };

  return (
    <aside className="requirements">
      <h2>BC Core (MCAS)</h2>
      <button className="btn-primary" style={{ width: "100%", marginBottom: 15 }} onClick={handleReset}>
        Reset 4-Year Plan
      </button>

      <div className="req-progress">
        {totalReqs > 0
          ? `${doneReqs} / ${totalReqs} requirements completed (${pct}%)`
          : "Select a major to track progress"}
      </div>

      <ul>
        {BC_CORE_REQS.map((req, i) => (
          <li key={`core-${i}`}>
            <label>
              <input
                type="checkbox"
                checked={checkedReqs.includes(req)}
                onChange={() => toggleReq(req)}
              />
              <span>{req}</span>
            </label>
          </li>
        ))}
      </ul>

      <hr className="req-divider" />

      <h2>Major Requirements</h2>
      <label className="major-label" htmlFor="major-select">Select a major:</label>
      <select
        id="major-select"
        className="major-select"
        value={major}
        onChange={(e) => setMajor(e.target.value)}
      >
        <option value="">-- choose a major --</option>
        {majors.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>

      <ul className="major-req-list">
        {selectedMajor ? (
          selectedMajor.requirements.map((req, i) => (
            <li key={`major-${i}`}>
              <label>
                <input
                  type="checkbox"
                  checked={checkedReqs.includes(req)}
                  onChange={() => toggleReq(req)}
                />
                <span>{req}</span>
              </label>
            </li>
          ))
        ) : (
          <li className="empty">Choose a major to see its classes.</li>
        )}
      </ul>

      <hr className="req-divider" />

      <h2>GPA Calculator</h2>
      <GPADisplay />
    </aside>
  );
}
