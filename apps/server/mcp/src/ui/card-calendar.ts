import type {
  McpCalendarDay,
  McpCard,
} from '@mcp/shared/interfaces/mcp-app.interface';

/**
 * The calendar view groups posts by the viewer's local day, so the day keys
 * come from local date parts, never from the UTC string.
 */
export function localDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function parseDay(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}
export function localCalendarDays(days: McpCalendarDay[]) {
  const keys = new Set<string>();
  const posts = new Map<string, McpCard[]>();
  const first = parseDay(days[0]?.date || '');
  if (!Number.isNaN(first.getTime()))
    for (let offset = 0; offset < days.length; offset++) {
      const date = new Date(first);
      date.setDate(first.getDate() + offset);
      keys.add(localDayKey(date));
    }
  for (const day of days)
    for (const post of day.posts) {
      const date = new Date(post.date);
      if (Number.isNaN(date.getTime())) continue;
      const key = localDayKey(date);
      keys.add(key);
      posts.set(key, [...(posts.get(key) || []), post]);
    }
  return [...keys].sort().map((date) => ({
    date,
    posts: (posts.get(date) || []).sort((a, b) => a.date.localeCompare(b.date)),
  }));
}
