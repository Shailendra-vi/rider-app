const IST_OFFSET_MINUTES = 330;

export function toDateString(value) {
  return typeof value === 'string' ? value.slice(0, 10) : value;
}

export function addDays(serviceDate, n) {
  const [y, m, d] = serviceDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86_400_000).toISOString().slice(0, 10);
}

export function istServiceDateNow(now = new Date()) {
  return new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

export function istWeekday(serviceDate) {
  const [y, m, d] = serviceDate.split('-').map(Number);
  const sundayBased = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (sundayBased + 6) % 7;
}

export function cutoffInstant(serviceDate) {
  const [y, m, d] = addDays(serviceDate, -1).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 11, 0) - IST_OFFSET_MINUTES * 60_000);
}
