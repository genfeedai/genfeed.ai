import type { ITurboRunItem } from '@genfeedai/contracts/interfaces';

export type ReviewPanelItem = ITurboRunItem & {
  gateOverallScore?: number;
  gateReasons?: string[];
  opportunitySourceType?: 'trend' | 'event' | 'evergreen';
  opportunityTopic?: string;
};
