import type { TrendCorpusFreshnessHealth } from '@props/trends/trends-page.props';

export type Props = {
  corpusHealth: TrendCorpusFreshnessHealth | null;
  formattedLastSyncedAt: string;
  isCorpusHealthUnavailable: boolean;
  videoCount: number;
  platformCount: number;
  leadingPlatform: { label: string; totalMentions: number } | null;
  totalTrackedTopics: number;
};
