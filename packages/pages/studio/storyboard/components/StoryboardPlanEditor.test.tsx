import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StoryboardPlanEditor from './StoryboardPlanEditor';

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({
    useConfirmModal: () => ({ openConfirm: vi.fn() }),
    useGalleryModal: () => ({ openGallery: vi.fn() }),
  }),
);
vi.mock('@pages/library/voices/hooks/use-voice-catalog', () => ({
  useVoiceCatalog: () => ({ voices: [] }),
}));
vi.mock('@pages/studio/storyboard/hooks/use-storyboard-assets', () => ({
  useStoryboardAssets: () => ({}),
}));
vi.mock('@pages/studio/storyboard/components/StoryboardAnimatic', () => ({
  default: () => null,
}));
vi.mock('@pages/studio/storyboard/components/StoryboardSelect', () => ({
  default: () => null,
}));
const run: StoryboardRun = {
  id: 'run',
  organizationId: 'org',
  brandId: 'brand',
  createdAt: '2026-09-30T00:00:00Z',
  updatedAt: '2026-09-30T00:00:00Z',
  config: {
    contract: 'storyboard-run',
    version: 1,
    revision: 1,
    clientRequestId: 'f86c1871-d577-4dca-b79d-6d9f295a58cc',
    createdByUserId: 'user',
    submittedInputHash: 'a'.repeat(64),
    state: 'storyboard',
    sourceSnapshot: {
      selector: { kind: 'brief', brief: 'Idea' },
      capturedAt: '2026-09-30T00:00:00Z',
    },
    plan: {
      title: 'Plan',
      logline: 'A scene',
      format: '9:16',
      runtimeBudgetSeconds: 10,
      styleReferenceAssetIds: [],
      cast: [],
      shots: [1, 2].map((ordinal) => ({
        id: `shot-${ordinal}`,
        ordinal,
        action: 'Look up',
        durationSeconds: 5,
        onScreenSpeaker: false,
        stillFreshness: 'fresh',
        stillAssetId: `image-${ordinal}`,
        transition: 'cut',
      })),
    },
  },
};
const update = async (
  revision: number,
  plan: StoryboardRun['config']['plan'],
) => ({ ...run, config: { ...run.config, revision: revision + 1, plan } });
describe('persisted storyboard plan editor', () => {
  it('flushes a dirty plan before approving the returned revision', async () => {
    const save = vi.fn(update);
    const approve = vi.fn().mockResolvedValue(run);
    render(
      <StoryboardPlanEditor
        run={run}
        savePlan={save}
        resetPlan={vi.fn()}
        approvePlan={approve}
        supportedDurations={[5]}
      />,
    );
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Changed title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Approve storyboard' }));
    await waitFor(() => expect(approve).toHaveBeenCalledWith(2));
    expect(save.mock.calls[0][1].title).toBe('Changed title');
  });
  it('retains the previous duration when a change exceeds the runtime budget', () => {
    render(
      <StoryboardPlanEditor
        run={run}
        savePlan={vi.fn(update)}
        resetPlan={vi.fn()}
        approvePlan={vi.fn()}
        supportedDurations={[5, 10]}
      />,
    );
    fireEvent.change(screen.getAllByLabelText('Duration (seconds)')[0], {
      target: { value: '10' },
    });
    expect(screen.getAllByLabelText('Duration (seconds)')[0]).toHaveValue(5);
    expect(screen.getByRole('alert')).toHaveTextContent('Shorten another shot');
  });
  it('retains dirty text and blocks approval after a failed save', async () => {
    const approve = vi.fn();
    render(
      <StoryboardPlanEditor
        run={run}
        savePlan={vi.fn().mockRejectedValue(new Error('Revision conflict'))}
        resetPlan={vi.fn()}
        approvePlan={approve}
      />,
    );
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Kept title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Approve storyboard' }));
    await waitFor(() =>
      expect(screen.getByText('Save failed')).toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Title')).toHaveValue('Kept title');
    expect(approve).not.toHaveBeenCalled();
  });
});
