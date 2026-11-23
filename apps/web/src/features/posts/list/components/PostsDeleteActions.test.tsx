import { PageScope, PostStatus } from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import { describe, expect, it, vi } from 'vitest';
import { buildPostsCardActions } from './PostsCardActions';
import { buildPostsTableActions } from './PostsTableActions';

const onDelete = vi.fn();
const handlers = {
  onDelete,
  onEdit: vi.fn(),
  onOpenPlatformUrl: vi.fn(),
  onRemix: vi.fn(),
  onRepurpose: vi.fn(),
  onRetry: vi.fn(),
  onViewIngredient: vi.fn(),
};

const statuses = [
  PostStatus.DRAFT,
  PostStatus.SCHEDULED,
  PostStatus.FAILED,
  PostStatus.PUBLIC,
];

describe('delete action on every post', () => {
  it.each(statuses)('is offered in the card menu for a %s post', (status) => {
    const { secondaryCardActions } = buildPostsCardActions({
      ...handlers,
      editableStatuses: [PostStatus.DRAFT],
      scope: PageScope.PUBLISHING,
    });
    const remove = secondaryCardActions.find(
      (action) => action.key === 'delete',
    );
    const post = { id: 'p1', status } as IPost;

    expect(remove?.isVisible?.(post) ?? true).toBe(true);
    remove?.onClick(post);
    expect(onDelete).toHaveBeenCalledWith(post);
  });

  it.each(statuses)('is offered in the table row for a %s post', (status) => {
    const actions = buildPostsTableActions({
      ...handlers,
      scope: PageScope.PUBLISHING,
    });
    const remove = actions.find((action) => action.tooltip === 'Delete');
    const post = { id: 'p1', status } as IPost;

    expect(remove?.isVisible?.(post) ?? true).toBe(true);
  });
});
