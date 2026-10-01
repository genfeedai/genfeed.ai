import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type { StoryboardRunCapabilities } from '@genfeedai/contracts/api-types/contracts/storyboard-run-capabilities.contract';
import type {
  StoryboardPlanEditorProps,
  StoryboardSelectProps,
} from '@genfeedai/props/studio/storyboard.props';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StoryboardPlanEditor from './StoryboardPlanEditor';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({
    useConfirmModal: () => ({ openConfirm: vi.fn() }),
    useGalleryModal: () => ({ openGallery: vi.fn() }),
  }),
);
vi.mock('@pages/studio/storyboard/hooks/use-storyboard-voices', () => ({
  useStoryboardVoices: () => ({ voices: [], status: 'loaded', retry: vi.fn() }),
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/org/brand${path}` }),
}));
vi.mock('@pages/studio/storyboard/hooks/use-storyboard-assets', () => ({
  useStoryboardAssets: () => ({}),
}));
vi.mock('@pages/studio/storyboard/components/StoryboardAnimatic', () => ({
  default: () => null,
}));
vi.mock('@pages/studio/storyboard/components/StoryboardSelect', () => ({
  default: ({
    ariaLabel,
    value,
    options,
    onChange,
    isDisabled,
  }: StoryboardSelectProps) => (
    <select
      aria-label={ariaLabel}
      value={value ?? '__none'}
      disabled={isDisabled}
      onChange={(event) =>
        onChange(
          event.target.value === '__none' ? undefined : event.target.value,
        )
      }
    >
      <option value="__none">Clear selection</option>
      {options.map((option) => (
        <option
          key={option.value}
          value={option.value}
          disabled={option.isDisabled}
        >
          {option.label}
        </option>
      ))}
    </select>
  ),
}));
const run = {
  id: 'run',
  organizationId: 'org',
  brandId: 'brand',
  createdAt: '2026-09-30T00:00:00Z',
  updatedAt: '2026-09-30T00:00:00Z',
  config: {
    origin: 'native' as const,
    contract: 'storyboard-run' as const,
    version: 1 as const,
    revision: 1,
    clientRequestId: 'f86c1871-d577-4dca-b79d-6d9f295a58cc',
    createdByUserId: 'user',
    submittedInputHash: 'a'.repeat(64),
    state: 'storyboard' as const,
    sourceSnapshot: {
      selector: { kind: 'brief', brief: 'Idea' },
      capturedAt: '2026-09-30T00:00:00Z',
    },
    plan: {
      title: 'Plan',
      logline: 'A scene',
      format: '9:16',
      videoModelKey: null,
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
} satisfies StoryboardRun;
function capabilities(durations: number[]): StoryboardRunCapabilities {
  const model = {
    key: 'model',
    label: 'Fixture video model',
    provider: 'fixture',
    supportedDurationsSeconds: durations,
    defaultDurationSeconds: null,
    hasInterpolation: false,
    supportedFormats: ['9:16' as const],
    capabilitySource: 'catalog' as const,
  };
  return {
    version: 1,
    runId: run.id,
    runRevision: 1,
    capabilityVersion: 'a'.repeat(64),
    status: 'available',
    requestedModelKey: null,
    effectiveModel: model,
    eligibleModels: [model],
    reasonCode: null,
  };
}
const update: StoryboardPlanEditorProps['savePlan'] = async (revision, plan) =>
  ({
    ...run,
    config: { ...run.config, revision: revision + 1, plan },
  }) as StoryboardRun;
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
        capabilities={capabilities([5])}
      />,
    );
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Changed title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Approve storyboard' }));
    await waitFor(() => expect(approve).toHaveBeenCalledWith(2));
    expect(save.mock.calls[0][1].title).toBe('Changed title');
  });
  it('keeps an unavailable saved voice visible, blocks invalid resave, and permits explicit clearing', async () => {
    const save = vi.fn(update);
    const approve = vi.fn();
    const selected = {
      ...run,
      config: {
        ...run.config,
        plan: {
          ...run.config.plan,
          cast: [
            {
              id: 'narrator',
              name: 'Narrator',
              voiceId: 'missing-voice',
              referenceAssetIds: [],
            },
          ],
        },
      },
    };
    render(
      <StoryboardPlanEditor
        run={selected}
        savePlan={save}
        resetPlan={vi.fn()}
        approvePlan={approve}
        capabilities={capabilities([5])}
      />,
    );
    const voice = screen.getByLabelText('Voice for Narrator');
    expect(voice).toHaveValue('missing-voice');
    expect(
      screen.getByRole('option', {
        name: 'Saved voice unavailable — replace or clear',
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Approve storyboard' }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Kept while replacing voice' },
    });
    await waitFor(
      () => expect(screen.getByText('Save failed')).toBeInTheDocument(),
      { timeout: 2500 },
    );
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(voice, { target: { value: '__none' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve storyboard' }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][1].cast[0].voiceId).toBeUndefined();
    expect(save.mock.calls[0][1].title).toBe('Kept while replacing voice');
  });
  it('retains the previous duration when a change exceeds the runtime budget', () => {
    render(
      <StoryboardPlanEditor
        run={run}
        savePlan={vi.fn(update)}
        resetPlan={vi.fn()}
        approvePlan={vi.fn()}
        capabilities={capabilities([5, 10])}
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
        capabilities={capabilities([5])}
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
