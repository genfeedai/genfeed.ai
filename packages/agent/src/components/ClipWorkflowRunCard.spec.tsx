import { ClipWorkflowRunCard } from '@genfeedai/agent/components/ClipWorkflowRunCard';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { buildClipDraftAgentHref } from '@genfeedai/utils/url/desktop-loop-url.util';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/test-org/test-brand${path}`,
  }),
}));

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
      createPrompt: vi.fn().mockResolvedValue({ id: 'prompt-123' }),
      generateIngredient: vi.fn().mockResolvedValue({ id: 'video-123' }),
      mergeVideos: vi.fn().mockResolvedValue({ id: 'merged-video-123' }),
      reframeVideo: vi.fn().mockResolvedValue({ id: 'video-portrait-123' }),
      resizeVideo: vi.fn().mockResolvedValue({ id: 'resized-video-123' }),
      triggerWorkflow: vi.fn().mockResolvedValue({ id: 'exec-123' }),
    };

    render(
      <ClipWorkflowRunCard action={action} apiService={apiService as never} />,
    );

    const runNextButton = screen.getByRole('button', { name: 'Run Next Step' });

    fireEvent.click(runNextButton);

    await waitFor(() => {
      expect(apiService.generateIngredient).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('Generated clips: 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Run Next Step' }));

    await waitFor(() => {
      expect(apiService.reframeVideo).toHaveBeenCalledTimes(1);
    });

    const reviewLink = await screen.findByRole('link', {
      name: 'Open draft handoff →',
    });

    expect(reviewLink).toHaveAttribute(
      'href',
      buildClipDraftAgentHref({
        description: 'Turn this launch clip into a polished reel',
        ingredientId: 'video-portrait-123',
        title: 'Launch clip',
      }),
    );
    expect(
      screen.getByRole('link', { name: 'Open human review queue →' }),
    ).toHaveAttribute('href', '/test-org/test-brand/publishing/review');

    fireEvent.click(
      screen.getByRole('button', { name: 'Open Supervised Review' }),
    );

    await waitFor(() => {
      expect(locationMock.href).toBe(
        '/publishing/review?batch=batch-123&item=item-456',
      );
    });
  });

  it('blocks clip generation when identity defaults are incomplete', async () => {
    const action: AgentUiAction = {
      clipRun: {
        identity: {
          isComplete: false,
          label: 'Missing avatar and voice defaults',
          missing: ['avatar', 'voice'],
          source: 'missing',
          useIdentity: true,
        },
        mergeGeneratedVideos: false,
        prompt: 'Turn this launch clip into a polished reel',
      },
      id: 'clip-missing-identity-1',
      title: 'Launch clip',
      type: 'clip_workflow_run_card',
    };

    const apiService = {
      createManualReviewBatch: vi.fn(),
      createPrompt: vi.fn().mockResolvedValue({ id: 'prompt-123' }),
      generateIngredient: vi.fn(),
      mergeVideos: vi.fn(),
      reframeVideo: vi.fn(),
      resizeVideo: vi.fn(),
      triggerWorkflow: vi.fn(),
    };

    render(
      <ClipWorkflowRunCard action={action} apiService={apiService as never} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Run Next Step' }));

    expect(
      await screen.findByText(
        /Configure saved avatar and voice defaults or enter explicit IDs before generating clips\./,
      ),
    ).toBeInTheDocument();
    expect(apiService.createPrompt).not.toHaveBeenCalled();
  });
});
