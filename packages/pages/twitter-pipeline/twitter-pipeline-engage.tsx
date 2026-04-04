'use client';

import type {
  ITwitterOpportunity,
  ITwitterPublishResult,
  ITwitterSearchResult,
  ITwitterVoiceConfig,
} from '@cloud/interfaces';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import OpportunityCard from '@pages/twitter-pipeline/components/opportunity-card';
import TweetCard from '@pages/twitter-pipeline/components/tweet-card';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { TwitterPipelineService } from '@services/twitter/twitter-pipeline.service';
import Button from '@ui/buttons/base/Button';
import Loading from '@ui/loading/default/Loading';
import { Input } from '@ui/primitives/input';
import { useCallback, useMemo, useState } from 'react';
import { HiArrowPath, HiMagnifyingGlass, HiSparkles } from 'react-icons/hi2';

export default function TwitterPipelineEngage() {
  const { organizationId, brandId, isReady } = useBrand();
  const [searchQuery, setSearchQuery] = useState('');
  const [handle, setHandle] = useState('');
  const [description, setDescription] = useState('');

  const getService = useAuthedService((token: string) =>
    TwitterPipelineService.getInstance(token),
  );

  // We need token + orgId for the hook, so we manage pipeline state via callbacks
  const [status, setStatus] = useState<
    'idle' | 'searching' | 'drafting' | 'ready' | 'publishing' | 'done'
  >('idle');
  const [searchResults, setSearchResults] = useState<ITwitterSearchResult[]>(
    [],
  );
  const [opportunities, setOpportunities] = useState<ITwitterOpportunity[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isLoading =
    status === 'searching' || status === 'drafting' || status === 'publishing';

  const voiceConfig = useMemo<ITwitterVoiceConfig>(
    () => ({
      description,
      handle,
      searchQuery,
    }),
    [description, handle, searchQuery],
  );

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !organizationId) {
      return;
    }

    setStatus('searching');
    setError(null);
    setSearchResults([]);
    setOpportunities([]);

    try {
      const service = await getService();
      const results = await service.search(
        organizationId,
        brandId,
        voiceConfig,
      );
      setSearchResults(results);
      setStatus('ready');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Search failed';
      setError(message);
      setStatus('idle');
      logger.error('TwitterPipelineEngage.search failed', err);
      NotificationsService.getInstance().error('Failed to search tweets');
    }
  }, [searchQuery, organizationId, brandId, getService, voiceConfig]);

  const handleDraft = useCallback(async () => {
    if (searchResults.length === 0 || !organizationId) {
      return;
    }

    setStatus('drafting');
    setError(null);

    try {
      const service = await getService();
      const results = await service.draft(
        organizationId,
        searchResults,
        voiceConfig,
      );
      setOpportunities(results);
      setStatus('ready');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Draft generation failed';
      setError(message);
      setStatus('ready');
      logger.error('TwitterPipelineEngage.draft failed', err);
      NotificationsService.getInstance().error('Failed to generate drafts');
    }
  }, [searchResults, organizationId, getService, voiceConfig]);

  const handlePublish = useCallback(
    async (
      text: string,
      type: ITwitterOpportunity['type'],
      targetTweetId?: string,
    ): Promise<ITwitterPublishResult | undefined> => {
      if (!organizationId) {
        return undefined;
      }

      try {
        const service = await getService();
        const result = await service.publish(organizationId, brandId, {
          targetTweetId,
          text,
          type,
        });

        if (result.success) {
          NotificationsService.getInstance().success('Tweet published!');
        } else {
          NotificationsService.getInstance().error(
            result.error ?? 'Publish failed',
          );
        }

        return result;
      } catch (err: unknown) {
        logger.error('TwitterPipelineEngage.publish failed', err);
        NotificationsService.getInstance().error('Failed to publish tweet');
        return undefined;
      }
    },
    [organizationId, brandId, getService],
  );

  const handleReset = useCallback(() => {
    setStatus('idle');
    setSearchResults([]);
    setOpportunities([]);
    setError(null);
    setSearchQuery('');
    setHandle('');
    setDescription('');
  }, []);

  if (!isReady) {
    return <Loading isFullSize={false} />;
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Search Section */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="text-sm font-medium text-foreground mb-4">
          Find Engagement Opportunities
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label
              htmlFor="pipeline-search-query"
              className="block text-xs text-muted-foreground mb-1"
            >
              Search Query
            </label>
            <Input
              id="pipeline-search-query"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g. AI content creation, social media automation"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSearch();
                }
              }}
            />
          </div>
          <div>
            <label
              htmlFor="pipeline-handle"
              className="block text-xs text-muted-foreground mb-1"
            >
              Your Twitter Handle
            </label>
            <Input
              id="pipeline-handle"
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@yourhandle"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="mb-4">
          <label
            htmlFor="pipeline-voice-description"
            className="block text-xs text-muted-foreground mb-1"
          >
            Voice Description
          </label>
          <Input
            id="pipeline-voice-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Friendly AI expert who shares practical tips"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={ButtonVariant.DEFAULT}
            onClick={handleSearch}
            isDisabled={!searchQuery.trim() || isLoading}
          >
            <HiMagnifyingGlass className="w-4 h-4" />
            {status === 'searching' ? 'Scanning...' : 'Scan Trends'}
          </Button>

          {(searchResults.length > 0 || opportunities.length > 0) && (
            <Button variant={ButtonVariant.OUTLINE} onClick={handleReset}>
              <HiArrowPath className="w-4 h-4" />
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Search Results Section */}
      {searchResults.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-foreground">
              Trending Tweets ({searchResults.length})
            </h3>
            <Button
              variant={ButtonVariant.DEFAULT}
              onClick={handleDraft}
              isDisabled={isLoading}
            >
              <HiSparkles className="w-4 h-4" />
              {status === 'drafting' ? 'Drafting...' : 'Draft with Grok'}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {searchResults.map((tweet) => (
              <TweetCard key={tweet.id} tweet={tweet} />
            ))}
          </div>
        </div>
      )}

      {/* Searching indicator */}
      {status === 'searching' && (
        <div className="flex justify-center py-8">
          <Loading isFullSize={false} />
        </div>
      )}

      {/* Drafting indicator */}
      {status === 'drafting' && (
        <div className="flex justify-center py-8">
          <Loading isFullSize={false} />
        </div>
      )}

      {/* Opportunities Section */}
      {opportunities.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-foreground mb-4">
            Draft Opportunities ({opportunities.length})
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {opportunities.map((opportunity, index) => (
              <OpportunityCard
                key={`${opportunity.type}-${opportunity.targetTweetId ?? index}`}
                opportunity={opportunity}
                onPublish={handlePublish}
                isPublishing={status === 'publishing'}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
