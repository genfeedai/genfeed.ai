import { PublishPostCard } from '@genfeedai/agent/components/PublishPostCard';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('PublishPostCard', () => {
  it('renders defaults and submits confirm_publish_post through the shared UI action handler', async () => {
    const onUiAction = vi.fn().mockResolvedValue(undefined);
    const action: AgentUiAction = {
      contentId: 'ingredient-1',
      data: {
        availablePlatforms: ['linkedin', 'twitter'],
      },
      description: 'Review and confirm.',
      id: 'publish-card-1',
      platforms: ['linkedin'],
      textContent: 'Initial caption',
      title: 'Publish selected content',
      type: 'publish_post_card',
    };

    render(<PublishPostCard action={action} onUiAction={onUiAction} />);

    fireEvent.change(screen.getByPlaceholderText('Optional caption override'), {
      target: { value: 'Updated caption' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'twitter' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm publish' }));
    });

    expect(onUiAction).toHaveBeenCalledWith('confirm_publish_post', {
      caption: 'Updated caption',
      contentId: 'ingredient-1',
      platforms: ['linkedin', 'twitter'],
      scheduledAt: undefined,
      sourceActionId: 'publish-card-1',
    });
  });

  it('disables confirmation when no platforms are selected', () => {
    const action: AgentUiAction = {
      contentId: 'ingredient-2',
      data: {
        availablePlatforms: ['linkedin'],
      },
      id: 'publish-card-2',
      platforms: ['linkedin'],
      title: 'Publish selected content',
      type: 'publish_post_card',
    };

    render(<PublishPostCard action={action} />);

    fireEvent.click(screen.getByRole('button', { name: 'linkedin' }));

    expect(
      screen.getByRole('button', { name: 'Confirm publish' }),
    ).toBeDisabled();
  });
});
