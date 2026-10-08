import type { TrendCorpusFreshnessHealth } from './trends-page.props';

export interface CorpusHealthPanelProps {
  scope?: 'all' | 'global' | 'scoped';
  health?: TrendCorpusFreshnessHealth | null;
  isUnavailable?: boolean;
  selectedPlatforms?: readonly string[];
}
