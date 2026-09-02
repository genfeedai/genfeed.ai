export interface TrendTurnoverStats {
  platform: string;
  appeared: number;
  died: number;
  alive: number;
  avgLifespanDays: number;
  turnoverRate: number; // 0-100 percentage
}

export interface TrendTimelineEntry {
  date: string; // YYYY-MM-DD
  appeared: number;
  died: number;
}

export interface TrendTurnoverResponse {
  days: number;
  byPlatform: TrendTurnoverStats[];
  totals: Omit<TrendTurnoverStats, 'platform'>;
  timeline: TrendTimelineEntry[];
}
