export interface Course {
  code: string;
  name: string;
  section: string;
  credits: number;
  days: string[];
  startTime: string;
  endTime: string;
  professor: string;
  description: string;
  prerequisites: string[];
  coreRequirement: string | null;
  room: string;
  semester: string;
}

export interface Major {
  id: string;
  name: string;
  type: string;
  requirements: string[];
  suggestions: { name: string; reason: string }[];
}

export interface Opportunity {
  id: number;
  title: string;
  company: string;
  location: string;
  type: string;
  majors: string[];
  description: string;
  url: string;
  posted: string;
}

export interface PlanSlot {
  courseName: string;
  credits: string;
  grade: string;
}

export interface PlanData {
  major: string;
  semesters: PlanSlot[][];
  checkedReqs: string[];
}

export interface ScheduleExport {
  semester: string;
  courses: { name: string; credits: number }[];
}
