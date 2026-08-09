import type { IBatchItem } from '@genfeedai/interfaces';

export type ReviewPanelItem = IBatchItem & {
  gateOverallScore?: number;
  gateReasons?: string[];
  opportunitySourceType?: 'trend' | 'event' | 'evergreen';
  opportunityTopic?: string;
};
