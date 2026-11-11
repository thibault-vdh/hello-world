// Calendar-date helpers. Dates are plain "YYYY-MM-DD" strings so nothing here
// depends on the server's timezone.

const DAY = 86_400_000;

export function toUTC(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  return fromUTC(toUTC(date) + n * DAY);
}

export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(a) - toUTC(b)) / DAY);
}

/** 0 = Sunday. */
export function weekday(date: string): number {
  return new Date(toUTC(date)).getUTCDay();
}

/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  return addDays(date, -((weekday(date) + 6) % 7));
}

export function daysInMonth(date: string): number {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthStart(date: string): string {
  return date.slice(0, 8) + "01";
}

export function parseClock(clock: string): number {
  const [h, m] = clock.split(":").map(Number);
  return h * 60 + m;
}

/** Minutes relative to midnight -> "22:30" (negative values are the evening before). */
export function formatClock(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function formatHours(min: number): string {
  const r = Math.round(min);
  return `${Math.floor(r / 60)}h${String(r % 60).padStart(2, "0")}`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function weekdayName(date: string): string {
  return WEEKDAYS[weekday(date)];
}

export function monthName(date: string): string {
  return MONTHS[Number(date.slice(5, 7)) - 1];
}

/**
 * Local wall-clock parts of an ISO instant, given an offset like "+01:00".
 * Returns the local date and minutes since local midnight.
 */
export function localParts(iso: string, offset: string): { date: string; minutes: number } {
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(offset ?? "");
  const off = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  const shifted = new Date(new Date(iso).getTime() + off * 60_000);
  return {
    date: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}
