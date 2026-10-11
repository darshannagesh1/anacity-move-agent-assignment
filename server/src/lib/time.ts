export function toISTDate(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

// server may run in UTC (Render), but notice periods are counted in IST
export function todayIST(): string {
  return toISTDate(new Date());
}
