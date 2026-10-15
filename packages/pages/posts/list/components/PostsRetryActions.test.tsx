import { PageScope, PostStatus } from '@genfeedai/contracts';
import { ACCOUNT_GENERATION_POST_SOURCE } from '@genfeedai/contracts/constants';
import type { IPost } from '@genfeedai/contracts/interfaces';
import { describe, expect, it, vi } from 'vitest';
import { buildPostsCardActions } from './PostsCardActions';
import { buildPostsTableActions } from './PostsTableActions';

const handlers = {
  onDelete: vi.fn(),
  onEdit: vi.fn(),
  onOpenPlatformUrl: vi.fn(),
  onRemix: vi.fn(),
  onRepurpose: vi.fn(),
  onRetry: vi.fn(),
  onViewIngredient: vi.fn(),
};

const failedPublish = { id: 'p1', status: PostStatus.FAILED } as IPost;
const failedGeneration = {
  id: 'p2',
  source: ACCOUNT_GENERATION_POST_SOURCE,
  status: PostStatus.FAILED,
} as IPost;

describe('failed post retry actions', () => {
  it('names the card retry after what it retries', () => {
    const { secondaryCardActions } = buildPostsCardActions({
      ...handlers,
      editableStatuses: [PostStatus.DRAFT],
      scope: PageScope.PUBLISHING,
    });
    const retry = secondaryCardActions.find((action) => action.key === 'retry');
    const label = (post: IPost) =>
      typeof retry?.label === 'function' ? retry.label(post) : retry?.label;

    expect(retry?.isVisible?.(failedGeneration)).toBe(true);
    expect(label(failedGeneration)).toBe('Retry generation');
    expect(label(failedPublish)).toBe('Retry publishing');
  });

  it('names the table retry after what it retries and routes it through onRetry', () => {
    const actions = buildPostsTableActions({
      ...handlers,
      scope: PageScope.PUBLISHING,
    });
    const retry = actions.find((action) => action.tooltip instanceof Function);
    const tooltip = (post: IPost) =>
      typeof retry?.tooltip === 'function' ? retry.tooltip(post) : '';

    expect(tooltip(failedGeneration)).toBe('Retry generation');
    expect(tooltip(failedPublish)).toBe('Retry publishing');
    retry?.onClick?.(failedGeneration);
    expect(handlers.onRetry).toHaveBeenCalledWith(failedGeneration);
  });
});
