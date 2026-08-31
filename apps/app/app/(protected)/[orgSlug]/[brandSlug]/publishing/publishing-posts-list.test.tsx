import { PageScope } from '@genfeedai/enums';
import type { IPost } from '@genfeedai/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublishingPostsList from './publishing-posts-list';

const openAgentComposer = vi.fn();

vi.mock('@/hooks/use-open-agent-composer', () => ({
  useOpenAgentComposer: () => openAgentComposer,
}));

vi.mock('@pages/posts/list/posts-list', () => ({
  default: ({
    onRewriteWithAgent,
    onSuggestScheduleWithAgent,
  }: {
    onRewriteWithAgent: (post: IPost) => void;
    onSuggestScheduleWithAgent: (post: IPost) => void;
  }) => {
    const post = { id: 'post-123' } as IPost;

    return (
      <div>
        <button type="button" onClick={() => onRewriteWithAgent(post)}>
          Rewrite caption
        </button>
        <button type="button" onClick={() => onSuggestScheduleWithAgent(post)}>
          Suggest schedule
        </button>
      </div>
    );
  },
}));

describe('PublishingPostsList', () => {
  beforeEach(() => {
    openAgentComposer.mockReset();
  });

  it('seeds a caption rewrite with the post ID', () => {
    render(<PublishingPostsList scope={PageScope.PUBLISHING} />);

    fireEvent.click(screen.getByRole('button', { name: 'Rewrite caption' }));

    expect(openAgentComposer).toHaveBeenCalledWith(
      expect.stringMatching(/rewrite the caption for post ID post-123/i),
    );
  });

  it('seeds a schedule suggestion with the post ID and confirmation boundary', () => {
    render(<PublishingPostsList scope={PageScope.PUBLISHING} />);

    fireEvent.click(screen.getByRole('button', { name: 'Suggest schedule' }));

    expect(openAgentComposer).toHaveBeenCalledWith(
      expect.stringMatching(
        /schedule for post ID post-123.*do not schedule it until I confirm/i,
      ),
    );
  });
});
