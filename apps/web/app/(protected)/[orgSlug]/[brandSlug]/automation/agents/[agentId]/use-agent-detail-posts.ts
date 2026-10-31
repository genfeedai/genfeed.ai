import type { IPost } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isCollectionFetchReady,
  toBrandListParams,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useVisiblePolling } from '@hooks/ui/use-visible-polling/use-visible-polling';
import { PostsService } from '@services/content/posts.service';
import { useQuery } from '@tanstack/react-query';

const AGENT_POSTS_PAGE_SIZE = 50;

/**
 * The agent's own generated content, shared by `AgentWorkSection` (the
 * Activity timeline's Content filter) and the record detail Needs You block
 * (pending-review count). One query key so react-query serves both from the
 * same cache entry instead of two network requests (#5483).
 */
export function useAgentDetailPosts(agentId: string) {
  const scope = useCollectionScope();
  const getService = useAuthedService((token: string) =>
    PostsService.getInstance(token),
  );
  const isReady = isCollectionFetchReady(scope);

  const {
    data: posts = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<IPost[]>({
    queryKey: ['agent-posts', scope.organizationId, scope.brandId, agentId],
    enabled: isReady,
    queryFn: async ({ signal }) =>
      (await getService()).findAll(
        {
          ...toBrandListParams(scope),
          agentStrategyId: agentId,
          limit: AGENT_POSTS_PAGE_SIZE,
          sort: '-createdAt',
        },
        signal,
      ),
  });

  useVisiblePolling(
    () => {
      void refetch();
    },
    { intervalMs: 30_000, isEnabled: isReady },
  );

  return { isError, isLoading, posts, refetch };
}
