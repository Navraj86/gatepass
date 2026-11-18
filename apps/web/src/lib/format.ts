export { formatMoney, formatTicketCode } from "@gatepass/shared";

const dateTime = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatDateTime(iso: string | Date) {
  return dateTime.format(new Date(iso));
}

/** "4:05" for a countdown in seconds. */
export function formatCountdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** "in 3 days", "in 2 h 5 min" for longer waits. */
export function formatWait(ms: number) {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} days`;
}

/** datetime-local input value in the browser's time zone. */
export function toLocalInput(iso: string | Date) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const day = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

/** "Sat, Dec 19" */
export function formatDay(iso: string | Date) {
  return day.format(new Date(iso));
}

/** "8:00 PM" */
export function formatTime(iso: string | Date) {
  return time.format(new Date(iso));
}

const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" });

/** "Dec 19" */
export function formatMonthDay(iso: string | Date) {
  return monthDay.format(new Date(iso));
}

/** "Sat" */
export function formatWeekday(iso: string | Date) {
  return weekday.format(new Date(iso));
}
