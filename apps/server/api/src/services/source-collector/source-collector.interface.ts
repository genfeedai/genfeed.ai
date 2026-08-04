import type { SocialSourcePlatform } from '@genfeedai/enums';
import type {
  SourceCollectContext,
  SourceCollectResult,
} from './source-collector.types';

/**
 * One retrieval strategy for a platform (OAuth, app bearer, Apify, etc.).
 * Providers are tried in priority order by {@link SourceCollectorService}.
 */
export interface SourceTimelineProvider {
  readonly name: SourceCollectResult['provider'];
  readonly platforms: readonly SocialSourcePlatform[];

  /**
   * Cheap readiness check (token present, etc.). Return false to skip.
   */
  canCollect(
    platform: SocialSourcePlatform,
    context: SourceCollectContext,
  ): Promise<boolean>;

  collectTimeline(
    platform: SocialSourcePlatform,
    handle: string,
    context: SourceCollectContext,
  ): Promise<SourceCollectResult>;
}
