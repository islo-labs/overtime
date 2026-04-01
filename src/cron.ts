import { CronExpressionParser } from "cron-parser";

export function validateCron(expression: string): {
  valid: boolean;
  error?: string;
} {
  try {
    CronExpressionParser.parse(expression);
    return { valid: true };
  } catch (e) {
    return { valid: false, error: (e as Error).message };
  }
}

export function nextRun(expression: string): Date {
  const interval = CronExpressionParser.parse(expression);
  return interval.next().toDate();
}

export function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = date.getTime() - now;

  if (diff < 0) return "now";

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `in ${days}d ${remainingHours}h` : `in ${days}d`;
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0
      ? `in ${hours}h ${remainingMinutes}m`
      : `in ${hours}h`;
  }
  if (minutes > 0) return `in ${minutes}m`;
  return `in ${seconds}s`;
}
