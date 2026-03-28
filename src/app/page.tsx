"use client";

import Link from "next/link";
import { usePlanStore } from "@/store/planStore";
import { useMajors } from "@/hooks/useMajors";
import styles from "./home.module.css";

export default function HomePage() {
  const { majors } = useMajors();
  const major = usePlanStore((s) => s.major);
  const semesters = usePlanStore((s) => s.semesters);
  const checkedReqs = usePlanStore((s) => s.checkedReqs);

  const selectedMajor = majors.find((m) => m.id === major);

  // Calculate total planned credits
  let totalCredits = 0;
  for (const sem of semesters) {
    for (const slot of sem) {
      const num = parseFloat(slot.credits);
      if (!isNaN(num)) totalCredits += num;
    }
  }

  const reqCount = checkedReqs.length;

  return (
    <div className={styles.container}>
      <aside className={styles.leftPanel}>
        <div className={styles.profileSection}>
          <h2>Your Profile</h2>
        </div>

        <div className={styles.panelSection}>
          <h3>Major</h3>
          <ul>
            {selectedMajor ? (
              <li><strong>{selectedMajor.name}</strong></li>
            ) : (
              <li>No major selected yet.</li>
            )}
          </ul>
        </div>

        <div className={styles.panelSection}>
          <h3>Suggestions</h3>
          <ul>
            {selectedMajor && selectedMajor.suggestions.length > 0 ? (
              selectedMajor.suggestions.map((s, i) => (
                <li key={i}>
                  <strong>{s.name}</strong>
                  <small>{s.reason}</small>
                </li>
              ))
            ) : (
              <li>
                {major
                  ? "No specific suggestions for this major."
                  : <>Go to the <Link href="/plan" style={{ color: "#8e0c03", fontWeight: 600 }}>4-Year Plan</Link> to select a major.</>
                }
              </li>
            )}
          </ul>
        </div>

        <div className={styles.panelSection}>
          <h3>Quick Stats</h3>
          <div className={styles.statsGrid}>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{totalCredits > 0 ? totalCredits : "--"}</span>
              <span className={styles.statLabel}>Credits Planned</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{reqCount > 0 ? reqCount : "--"}</span>
              <span className={styles.statLabel}>Reqs Completed</span>
            </div>
          </div>
        </div>
      </aside>

      <main className={styles.rightGrid}>
        <Link href="/scheduling" className={styles.tile}>
          <div className={styles.tileIcon}>&#128197;</div>
          <h3>Scheduling</h3>
          <p>Plan your next semester with smart conflict detection.</p>
        </Link>

        <Link href="/opportunities" className={styles.tile}>
          <div className={styles.tileIcon}>&#128188;</div>
          <h3>Opportunities</h3>
          <p>Internships, research, and clubs tailored to your major.</p>
        </Link>

        <Link href="/plan" className={styles.tile}>
          <div className={styles.tileIcon}>&#128218;</div>
          <h3>4-Year Planner</h3>
          <p>Visualize your degree timeline and requirements.</p>
        </Link>

        <div className={`${styles.tile} ${styles.disabled}`}>
          <div className={styles.tileIcon}>&#128196;</div>
          <h3>Upload Degree Audit</h3>
          <p>Import your degree audit to auto-track progress.</p>
          <span className={styles.comingSoonBadge}>Coming Soon</span>
        </div>
      </main>
    </div>
  );
}
