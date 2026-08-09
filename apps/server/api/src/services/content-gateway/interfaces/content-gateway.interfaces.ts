import type { PostDocument } from '@api/collections/posts/schemas/post.schema';
import type { JsonApiCollectionResponse } from '@genfeedai/interfaces';

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
  userId?: string;
}

export interface ContentGatewayResult {
  posts: PostDocument[];
  runs: string[];
}

export interface ContentGatewayResponse {
  posts: JsonApiCollectionResponse;
  runs: string[];
}
