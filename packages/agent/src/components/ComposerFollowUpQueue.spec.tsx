import { ComposerFollowUpQueue } from '@genfeedai/agent/components/ComposerFollowUpQueue';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) => {
    if (key === 'count') {
      return `${values?.count ?? 0} queued`;
    }
    if (key === 'queued') {
      return 'Queued';
    }
    if (key === 'sendNow') {
      return 'Send now (stops the current run)';
    }
    if (key === 'sendNowHint') {
      return 'Enter to send now';
    }
    if (key === 'remove') {
      return 'Remove follow-up';
    }
    if (key === 'retry') {
      return 'Retry follow-up';
    }
    if (key === 'failed') {
      return "Couldn't send";
    }
    return key;
  },
}));

describe('ComposerFollowUpQueue', () => {
  it('renders queued prompts with a count and can send one now', async () => {
    const user = userEvent.setup();
    const onSendNow = vi.fn();

    render(
      <ComposerFollowUpQueue
        isBusy
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onSendNow={onSendNow}
        queue={[
          {
            content: 'Make a square thumbnail',
            createdAt: '2026-08-13T00:00:00.000Z',
            id: 'q-1',
            status: 'queued',
            threadId: 'thread-1',
          },
        ]}
      />,
    );

    const queue = screen.getByTestId('composer-follow-up-queue');
    expect(queue).toHaveTextContent('Make a square thumbnail');
    expect(queue).toHaveTextContent('1 queued');
    expect(queue).toHaveTextContent('Enter to send now');
    expect(queue).toHaveAttribute('data-queue-state', 'generating-queued');
    expect(queue).toHaveAccessibleName('1 queued');

    await user.click(screen.getByLabelText('Send now (stops the current run)'));
    expect(onSendNow).toHaveBeenCalledWith('q-1');
  });

  it('exposes retry for a failed follow-up and does not leapfrog later items', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <ComposerFollowUpQueue
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onRetry={onRetry}
        onSendNow={vi.fn()}
        queue={[
          {
            content: 'Failed prompt',
            createdAt: '2026-08-13T00:00:00.000Z',
            id: 'q-1',
            status: 'failed',
            threadId: 'thread-1',
          },
          {
            content: 'Later prompt',
            createdAt: '2026-08-13T00:00:01.000Z',
            id: 'q-2',
            status: 'queued',
            threadId: 'thread-1',
          },
        ]}
      />,
    );

    expect(screen.getByTestId('composer-follow-up-queue')).toHaveAttribute(
      'data-queue-state',
      'dispatch-failed',
    );
    expect(screen.getByText(/Failed prompt/)).toHaveTextContent(
      "Couldn't send",
    );

    await user.click(screen.getByLabelText('Retry follow-up'));
    expect(onRetry).toHaveBeenCalledWith('q-1');
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
