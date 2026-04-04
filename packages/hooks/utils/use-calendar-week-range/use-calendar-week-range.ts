import { useState } from 'react';

export function useCalendarWeekRange() {
  const getCurrentWeekRange = (): { start: Date; end: Date } => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 (Sunday) to 6 (Saturday)
    const start = new Date(now);
    start.setDate(now.getDate() - dayOfWeek); // Start of week (Sunday)
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6); // End of week (Saturday)
    end.setHours(23, 59, 59, 999);

    return { end, start };
  };

  return useState<{ start: Date; end: Date } | null>(getCurrentWeekRange());
}
