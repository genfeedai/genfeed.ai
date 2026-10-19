export interface StreaksHeatmapProps {
  calendar: Record<string, { count?: number } | undefined>;
  isLoading: boolean;
}

export interface StreaksHeatmapCell {
  dayKey: string | null;
}
