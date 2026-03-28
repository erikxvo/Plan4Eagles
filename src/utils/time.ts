export const SLOT_HEIGHT = 45;
export const DEFAULT_START_HOUR = 9;
export const DEFAULT_END_HOUR = 17;

export function formatTime(time24: string): string {
  const [hours, minutes] = time24.split(":");
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minutes} ${ampm}`;
}

export function timeToPosition(time24: string, gridStartHour: number): number {
  const [hours, minutes] = time24.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes - gridStartHour * 60;
  return (totalMinutes / 30) * SLOT_HEIGHT;
}

export function calculateDuration(startTime: string, endTime: string): number {
  const [startHours, startMinutes] = startTime.split(":").map(Number);
  const [endHours, endMinutes] = endTime.split(":").map(Number);
  const durationMinutes = (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes);
  return (durationMinutes / 30) * SLOT_HEIGHT;
}

export function generateTimeSlots(startHour: number, endHour: number): string[] {
  const slots: string[] = [];
  const totalSlots = (endHour - startHour) * 2;
  for (let i = 0; i < totalSlots; i++) {
    const totalMinutes = startHour * 60 + i * 30;
    const hour = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const time24 = `${hour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
    slots.push(formatTime(time24));
  }
  return slots;
}
