"use client";

import { useState, useEffect } from "react";
import type { Major } from "@/types";

export function useMajors() {
  const [majors, setMajors] = useState<Major[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/data/majors.json")
      .then((res) => res.json())
      .then((data) => {
        setMajors(data);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Error loading majors:", err);
        setIsLoading(false);
      });
  }, []);

  return { majors, isLoading };
}
