"use client";

import { useState, useEffect, useMemo } from "react";
import { usePlanStore } from "@/store/planStore";
import { useMajors } from "@/hooks/useMajors";
import type { Opportunity } from "@/types";
import styles from "./opportunities.module.css";

const MAJOR_MAP: Record<string, string> = {
  "cs-bs": "Computer Science",
  "cs-ba": "Computer Science",
  "math-ba": "Mathematics",
  "math-bs": "Mathematics",
  "econ-ba": "Economics",
  "biology-ba": "Biology",
  "psych-ba": "Psychology",
  "poli-sci-ba": "Political Science",
};

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [majorFilter, setMajorFilter] = useState(true);

  const major = usePlanStore((s) => s.major);
  const { majors } = useMajors();

  useEffect(() => {
    fetch("/data/opportunities.json")
      .then((res) => res.json())
      .then((data) => {
        setOpportunities(data);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load opportunities:", err);
        setIsLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    let result = opportunities;
    if (typeFilter) {
      result = result.filter((opp) => opp.type === typeFilter);
    }
    if (majorFilter && major) {
      result = result.filter((opp) => opp.majors.includes(major));
    }
    return result;
  }, [opportunities, typeFilter, majorFilter, major]);

  const handshakeUrl = major && MAJOR_MAP[major]
    ? `https://app.joinhandshake.com/stu/postings?query=${encodeURIComponent(MAJOR_MAP[major])}`
    : "https://app.joinhandshake.com/stu/postings";

  return (
    <div className={styles.oppContainer}>
      <div className={styles.oppHeader}>
        <div>
          <h2>Career Opportunities</h2>
          <p className={styles.oppSubtitle}>Internships, research, clubs, and jobs tailored to your major.</p>
        </div>
        <a href={handshakeUrl} target="_blank" rel="noopener noreferrer" className={`btn-primary ${styles.handshakeLink}`}>
          Open Handshake
        </a>
      </div>

      <div className={styles.filterBar}>
        <select className={styles.oppFilter} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          <option value="Internship">Internships</option>
          <option value="Research">Research</option>
          <option value="On-Campus Job">On-Campus Jobs</option>
          <option value="Club">Clubs</option>
        </select>
        <label className={styles.majorFilterLabel}>
          <input
            type="checkbox"
            checked={majorFilter}
            onChange={(e) => setMajorFilter(e.target.checked)}
          />
          Show only my major
        </label>
      </div>

      <div className={styles.oppList}>
        {isLoading ? (
          <p className={styles.noResults}>Loading opportunities...</p>
        ) : filtered.length === 0 ? (
          <p className={styles.noResults}>No opportunities match your filters. Try changing the filter settings.</p>
        ) : (
          filtered.map((opp) => {
            const postedDate = new Date(opp.posted).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
            return (
              <div key={opp.id} className={`${styles.oppCard} fade-in`}>
                <div className={styles.oppCardBody}>
                  <h3 className={styles.oppCardTitle}>{opp.title}</h3>
                  <p className={styles.oppCardCompany}>{opp.company}</p>
                  <p className={styles.oppCardDesc}>{opp.description}</p>
                  <div className={styles.oppCardMeta}>
                    <span className={`${styles.oppTag} ${styles.oppTagType}`}>{opp.type}</span>
                    <span className={`${styles.oppTag} ${styles.oppTagLocation}`}>{opp.location}</span>
                    <span className={`${styles.oppTag} ${styles.oppTagDate}`}>Posted {postedDate}</span>
                  </div>
                </div>
                <div className={styles.oppCardAction}>
                  <a href={opp.url} target="_blank" rel="noopener noreferrer" className={styles.oppApplyBtn}>View</a>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
