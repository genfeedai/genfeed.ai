import type { PostDocument } from '@api/collections/posts/post.schema';
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
  executions: string[];
  posts: PostDocument[];
}

export interface ContentGatewayResponse {
  executions: string[];
  posts: JsonApiCollectionResponse;
}
