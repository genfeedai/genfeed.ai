import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ClipsApiService } from '../services/clips-api.service';
import ClipsProgressView from './ClipsProgressView';

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
