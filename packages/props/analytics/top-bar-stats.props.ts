export interface TopBarStatsProps {
  tweetCount: number;
  selectedCount: number;
  onPublish: () => void;
  onSchedule: () => void;
  canPublish: boolean;
}
