import { ComposerFollowUpQueue } from '@genfeedai/agent/components/ComposerFollowUpQueue';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

describe('ComposerFollowUpQueue', () => {
  it('renders queued prompts and can send one now', async () => {
    const user = userEvent.setup();
    const onSendNow = vi.fn();

    render(
      <ComposerFollowUpQueue
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onSendNow={onSendNow}
        queue={[
          {
            content: 'Make a square thumbnail',
            createdAt: '2026-08-13T00:00:00.000Z',
            id: 'q-1',
          },
        ]}
      />,
    );

    expect(screen.getByTestId('composer-follow-up-queue')).toHaveTextContent(
      'Make a square thumbnail',
    );

    await user.click(screen.getByLabelText('Send follow-up now'));
    expect(onSendNow).toHaveBeenCalledWith('q-1');
  });

  it('renders nothing when the queue is empty', () => {
    const { container } = render(
      <ComposerFollowUpQueue
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onSendNow={vi.fn()}
        queue={[]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
