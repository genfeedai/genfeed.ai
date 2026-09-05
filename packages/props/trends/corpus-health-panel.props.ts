import type { TrendCorpusFreshnessHealth } from './trends-page.props';

export interface CorpusHealthPanelProps {
  health?: TrendCorpusFreshnessHealth | null;
  isUnavailable?: boolean;
  selectedPlatforms?: readonly string[];
}
