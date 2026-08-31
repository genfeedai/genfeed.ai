import { PageScope, PostStatus } from '@genfeedai/enums';
import type { IPost } from '@genfeedai/interfaces';
import { describe, expect, it, vi } from 'vitest';
import { buildPostsCardActions } from './PostsCardActions';
import { buildPostsTableActions } from './PostsTableActions';

const draftPost = {
  id: 'post-1',
  status: PostStatus.DRAFT,
} as IPost;

const baseHandlers = {
  onDelete: vi.fn(),
  onEdit: vi.fn(),
  onOpenPlatformUrl: vi.fn(),
  onRemix: vi.fn(),
  onRepurpose: vi.fn(),
  onRetry: vi.fn(),
  onViewIngredient: vi.fn(),
};

describe('Posts agent actions', () => {
  it('routes table rewrite and schedule actions through the supplied callbacks', () => {
    const onRewriteWithAgent = vi.fn();
    const onSuggestScheduleWithAgent = vi.fn();
    const actions = buildPostsTableActions({
      ...baseHandlers,
      onRewriteWithAgent,
      onSuggestScheduleWithAgent,
      scope: PageScope.PUBLISHING,
    });

    const rewriteAction = actions.find(
      (action) => action.tooltip === 'Rewrite caption with agent',
    );
    const scheduleAction = actions.find(
      (action) => action.tooltip === 'Suggest schedule with agent',
    );

    expect(rewriteAction?.isVisible?.(draftPost)).toBe(true);
    expect(scheduleAction?.isVisible?.(draftPost)).toBe(true);
    rewriteAction?.onClick(draftPost);
    scheduleAction?.onClick(draftPost);
    expect(onRewriteWithAgent).toHaveBeenCalledWith(draftPost);
    expect(onSuggestScheduleWithAgent).toHaveBeenCalledWith(draftPost);
  });

  it('exposes the same seeded actions in the default publisher card view', () => {
    const onRewriteWithAgent = vi.fn();
    const onSuggestScheduleWithAgent = vi.fn();
    const { secondaryCardActions } = buildPostsCardActions({
      ...baseHandlers,
      editableStatuses: [PostStatus.DRAFT],
      onRewriteWithAgent,
      onSuggestScheduleWithAgent,
      scope: PageScope.PUBLISHING,
    });

    const rewriteAction = secondaryCardActions.find(
      (action) => action.key === 'rewrite-with-agent',
    );
    const scheduleAction = secondaryCardActions.find(
      (action) => action.key === 'suggest-schedule-with-agent',
    );

    expect(rewriteAction?.isVisible?.(draftPost)).toBe(true);
    expect(scheduleAction?.isVisible?.(draftPost)).toBe(true);
    rewriteAction?.onClick(draftPost);
    scheduleAction?.onClick(draftPost);
    expect(onRewriteWithAgent).toHaveBeenCalledWith(draftPost);
    expect(onSuggestScheduleWithAgent).toHaveBeenCalledWith(draftPost);
  });
});
