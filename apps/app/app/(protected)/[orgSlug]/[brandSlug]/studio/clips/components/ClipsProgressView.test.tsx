import type { ClipResult } from '@props/studio/clips.props';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClipsApiService } from '../services/clips-api.service';
import ClipsProgressView from './ClipsProgressView';

// Clip cards need the app router; this suite covers the run-level status.
vi.mock('./ClipResultCard', () => ({
  default: ({ clip }: { clip: ClipResult }) => <div>{clip.title}</div>,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

function renderApproval() {
  const clipsService = {
    submitHookApproval: vi.fn().mockResolvedValue({
      attempt: 1,
      hookClipResultId: 'hook-result-1',
      lastAction: 'approve',
      remainingClipCount: 3,
      state: 'approved',
    }),
  };
  render(
    <ClipsProgressView
      clipsService={clipsService as unknown as ClipsApiService}
      isRetrying={false}
      onReset={vi.fn()}
      onRetryFailedClips={vi.fn()}
      onRetrySource={vi.fn()}
      project={{
        clips: [],
        highlights: [],
        hookApproval: {
          attempt: 1,
          hookClipResultId: 'hook-result-1',
          remainingClipCount: 3,
          state: 'awaiting_confirmation',
        },
        mode: 'avatar',
        projectId: 'project-1',
        status: 'generating',
      }}
      selectedCount={4}
    />,
  );
  return clipsService;
}

describe('ClipsProgressView hook approval', () => {
  it.each([0, 2, 3])(
    'honors the persisted source retry budget at attempt %s',
    (retryCount) => {
      const onRetrySource = vi.fn();
      render(
        <ClipsProgressView
          clipsService={{} as ClipsApiService}
          isRetrying={false}
          onReset={vi.fn()}
          onRetryFailedClips={vi.fn()}
          onRetrySource={onRetrySource}
          project={{
            clips: [],
            highlights: [],
            mode: 'avatar',
            projectId: 'source-budget-project',
            status: 'failed',
            source: {
              schemaVersion: 1,
              kind: 'youtube',
              flow: 'review',
              status: 'failed',
              fingerprint: 'source-budget-fingerprint',
              retryCount,
              maxRetries: 3,
              updatedAt: '2026-10-10T00:00:00Z',
              failure: {
                code: 'TRANSCRIPTION_FAILED',
                message: 'Source transcription failed.',
                retryable: true,
              },
            },
          }}
          selectedCount={1}
        />,
      );
      const retry = screen.getByRole('button', {
        name: 'Retry source processing',
      });
      expect(
        screen.getByRole('heading', {
          name: 'This source couldn’t be processed',
        }),
      ).toBeDefined();
      expect(
        screen.getByText(
          'No clips were made. Retry source processing, or start a new project with another source.',
        ),
      ).toBeDefined();
      expect(screen.queryByText(/Check logs/)).toBeNull();
      expect(retry).toHaveProperty('disabled', retryCount === 3);
      fireEvent.click(retry);
      expect(onRetrySource).toHaveBeenCalledTimes(retryCount === 3 ? 0 : 1);
      expect(
        Boolean(
          screen.queryByText(
            'Source retry limit reached. No further retries are available.',
          ),
        ),
      ).toBe(retryCount === 3);
    },
  );

  it.each([
    {
      clips: [] as ClipResult[],
      description:
        'Clip generation stopped and this run can’t be retried. Start a new project to try again.',
      hasClipRetry: false,
    },
    {
      clips: [
        {
          duration: 30,
          endTime: 30,
          id: 'clip-1',
          startTime: 0,
          status: 'failed',
          summary: 'Opening hook',
          tags: [],
          title: 'Hook',
          viralityScore: 80,
        } satisfies ClipResult,
      ],
      description:
        'Clip generation stopped before it finished. Retry what failed below, or start a new project.',
      hasClipRetry: true,
    },
  ])(
    'shows why a quick run failed after transcription (clip retry: $hasClipRetry)',
    ({ clips, description, hasClipRetry }) => {
      render(
        <ClipsProgressView
          clipsService={{} as ClipsApiService}
          isRetrying={false}
          onReset={vi.fn()}
          onRetryFailedClips={vi.fn()}
          onRetrySource={vi.fn()}
          project={{
            clips,
            error: 'Avatar provider rejected the job',
            highlights: [],
            mode: 'avatar',
            projectId: 'quick-project',
            status: 'failed',
            source: {
              schemaVersion: 1,
              kind: 'youtube',
              flow: 'quick',
              status: 'completed',
              fingerprint: 'quick-fingerprint',
              retryCount: 0,
              maxRetries: 3,
              updatedAt: '2026-10-10T00:00:00Z',
            },
          }}
          selectedCount={1}
        />,
      );

      expect(
        screen.getByRole('heading', { name: 'Clip generation failed' }),
      ).toBeDefined();
      expect(screen.getByText(description)).toBeDefined();
      expect(screen.getByRole('status').textContent).toBe(
        'Avatar provider rejected the job',
      );
      expect(
        Boolean(screen.queryByRole('button', { name: 'Retry failed clips' })),
      ).toBe(hasClipRetry);
    },
  );

  it('exposes an accessible decision and approves without feedback', async () => {
    const clipsService = renderApproval();

    expect(
      screen.getByRole('heading', { name: 'Review the hook clip' }),
    ).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Approve hook' }));

    await waitFor(() =>
      expect(clipsService.submitHookApproval).toHaveBeenCalledWith(
        'project-1',
        { action: 'approve' },
      ),
    );
    expect(
      screen.getByRole('heading', { name: 'Generating remaining clips' }),
    ).toBeDefined();
  });

  it('requires review guidance before changes or rejection', async () => {
    const clipsService = renderApproval();
    const requestChanges = screen.getByRole('button', {
      name: 'Request changes',
    });
    expect(requestChanges.hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByLabelText('Hook review feedback'), {
      target: { value: 'Use a warmer delivery.' },
    });
    fireEvent.click(requestChanges);

    await waitFor(() =>
      expect(clipsService.submitHookApproval).toHaveBeenCalledWith(
        'project-1',
        {
          action: 'request_changes',
          feedback: 'Use a warmer delivery.',
        },
      ),
    );
  });
});
