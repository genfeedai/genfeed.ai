import { ClipWorkflowRunCard } from '@genfeedai/agent/components/ClipWorkflowRunCard';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
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
      createManualReviewBatchEffect: vi.fn(() =>
        Effect.succeed({
          id: 'batch-123',
          items: [{ id: 'item-456', postId: 'post-789' }],
        }),
      ),
      createPromptEffect: vi.fn(() => Effect.succeed({ id: 'prompt-123' })),
      generateIngredientEffect: vi.fn(() =>
        Effect.succeed({ id: 'video-123' }),
      ),
      mergeVideosEffect: vi.fn(() =>
        Effect.succeed({ id: 'merged-video-123' }),
      ),
      reframeVideoEffect: vi.fn(() =>
        Effect.succeed({ id: 'video-portrait-123' }),
      ),
      resizeVideoEffect: vi.fn(() =>
        Effect.succeed({ id: 'resized-video-123' }),
      ),
      triggerWorkflowEffect: vi.fn(() => Effect.succeed({ id: 'exec-123' })),
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
    ).toHaveAttribute('href', '/test-org/test-brand/posts/review');

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
