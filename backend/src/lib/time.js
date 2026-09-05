const IST_OFFSET_MINUTES = 330; // +05:30, no DST in India

export function toDateString(value) {
  return typeof value === 'string' ? value.slice(0, 10) : value;
}

export function addDays(serviceDate, n) {
  const [y, m, d] = serviceDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86_400_000).toISOString().slice(0, 10);
}

// 0=Mon to 6=Sun
export function istWeekday(serviceDate) {
  const [y, m, d] = serviceDate.split('-').map(Number);
  const sundayBased = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
  return (sundayBased + 6) % 7;
}

// The instant the book closes for `serviceDate`: 11:00 IST on the day before.
export function cutoffInstant(serviceDate) {
  const [y, m, d] = addDays(serviceDate, -1).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 11, 0) - IST_OFFSET_MINUTES * 60_000);
}
