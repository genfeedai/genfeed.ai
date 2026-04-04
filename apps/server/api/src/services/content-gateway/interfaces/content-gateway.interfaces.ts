import type { ContentDraftDocument } from '@api/collections/content-drafts/schemas/content-draft.schema';

export type ContentSignalType =
  | 'cron'
  | 'trend_alert'
  | 'performance_threshold'
  | 'manual'
  | 'webhook';

export interface ContentSignal {
  brandId: string;
  organizationId: string;
  payload?: Record<string, unknown>;
  type: ContentSignalType;
}

export interface ContentGatewayResult {
  drafts: ContentDraftDocument[];
  runs: string[];
}
