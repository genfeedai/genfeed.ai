import type { IBatchItem } from '@genfeedai/contracts/interfaces';

import type { ReviewPanelItem } from './review-panel.types';

describe('ReviewPanelItem', () => {
  it('extends the batch item contract with optional review metadata', () => {
    expectTypeOf<ReviewPanelItem>().toMatchTypeOf<IBatchItem>();
    expectTypeOf<
      Pick<
        ReviewPanelItem,
        | 'gateOverallScore'
        | 'gateReasons'
        | 'opportunitySourceType'
        | 'opportunityTopic'
      >
    >().toEqualTypeOf<{
      gateOverallScore?: number;
      gateReasons?: string[];
      opportunitySourceType?: 'trend' | 'event' | 'evergreen';
      opportunityTopic?: string;
    }>();
  });
});
