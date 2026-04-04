import { ClipWorkflowRunCard } from '@genfeedai/agent/components/ClipWorkflowRunCard';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ClipWorkflowRunCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('routes completed clips into the supervised draft flow', async () => {
    const locationMock = {
      href: '',
    };

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: locationMock,
    });

    const action: AgentUiAction = {
      brandId: 'brand-123',
      clipRun: {
        autonomousMode: false,
        durationSeconds: 30,
        mergeGeneratedVideos: false,
        prompt: 'Turn this launch clip into a polished reel',
        requireStepConfirmation: true,
      },
      id: 'clip-review-1',
      title: 'Launch clip',
      type: 'clip_workflow_run_card',
    };

    const apiService = {
      createManualReviewBatch: vi.fn().mockResolvedValue({
        id: 'batch-123',
        items: [{ id: 'item-456', postId: 'post-789' }],
      }),
      generateIngredient: vi.fn().mockResolvedValue({ id: 'video-123' }),
      mergeVideos: vi.fn(),
      reframeVideo: vi.fn().mockResolvedValue({ id: 'video-portrait-123' }),
      resizeVideo: vi.fn(),
      triggerWorkflow: vi.fn(),
    };

    render(
      <ClipWorkflowRunCard action={action} apiService={apiService as never} />,
    );

    const runNextButton = screen.getByRole('button', { name: 'Run Next Step' });

    await waitFor(() => {
      fireEvent.click(runNextButton);
    });

    await waitFor(() => {
      fireEvent.click(runNextButton);
    });

    const reviewLink = await screen.findByRole('link', {
      name: 'Open draft handoff →',
    });

    expect(reviewLink).toHaveAttribute(
      'href',
      '/compose/post?description=Turn+this+launch+clip+into+a+polished+reel&ingredientId=video-portrait-123&title=Launch+clip',
    );
    expect(
      screen.getByRole('link', { name: 'Open human review queue →' }),
    ).toHaveAttribute('href', '/posts/review');

    fireEvent.click(
      screen.getByRole('button', { name: 'Open Supervised Review' }),
    );

    await waitFor(() => {
      expect(locationMock.href).toBe(
        '/posts/review?batch=batch-123&item=item-456',
      );
    });
  });
});
