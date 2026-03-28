const COLORS = [
  { bg: "#ffe8cc", border: "#d4a66f" },
  { bg: "#ffd4d4", border: "#d48a8a" },
  { bg: "#d4f0ff", border: "#7ab8d4" },
  { bg: "#e8d4ff", border: "#b88ad4" },
  { bg: "#d4ffe8", border: "#7ad4a6" },
  { bg: "#ffe8f0", border: "#d4a6b8" },
  { bg: "#fff3d0", border: "#d4bd7a" },
  { bg: "#ffeedd", border: "#d4b88a" },
  { bg: "#e8f0ff", border: "#a6b8d4" },
];

const colorMap = new Map<string, { bg: string; border: string }>();
let colorIndex = 0;

export function getCourseColor(uniqueId: string): { bg: string; border: string } {
  const existing = colorMap.get(uniqueId);
  if (existing) return existing;

  const color = COLORS[colorIndex % COLORS.length];
  colorMap.set(uniqueId, color);
  colorIndex++;
  return color;
}

export function clearCourseColors(): void {
  colorMap.clear();
  colorIndex = 0;
}
