import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type { StoryboardPlanEditorProps } from '@genfeedai/props/studio/storyboard.props';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StoryboardDraftPage from './StoryboardDraftPage';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const mocks = vi.hoisted(() => ({ flush: vi.fn(), push: vi.fn() }));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/org/brand${path}` }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock(
  '@pages/studio/storyboard/components/StoryboardPlanEditor',
  async () => {
    const { useImperativeHandle } = await import('react');
    return {
      default: ({ ref }: Pick<StoryboardPlanEditorProps, 'ref'>) => {
        useImperativeHandle(ref, () => ({ flush: mocks.flush }));
        return <div>Plan editor</div>;
      },
    };
  },
);
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
describe('draft detail navigation', () => {
  beforeEach(() => {
    mocks.flush.mockReset();
    mocks.push.mockReset();
  });
  it('waits for the save before navigating back to scoped storyboards', async () => {
    let finish: (() => void) | undefined;
    mocks.flush.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <StoryboardDraftPage
        run={run}
        savePlan={vi.fn()}
        resetPlan={vi.fn()}
        approvePlan={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('link', { name: 'All storyboards' }));
    expect(mocks.push).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.flush).toHaveBeenCalled());
    finish?.();
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith('/org/brand/studio/storyboard'),
    );
  });
  it('flushes plan edits before saving a changed brief at the returned revision', async () => {
    mocks.flush.mockResolvedValue({ revision: 2, value: run.config.plan });
    const saveSource = vi.fn().mockResolvedValue({
      ...run,
      config: {
        ...run.config,
        revision: 3,
        sourceSnapshot: {
          ...run.config.sourceSnapshot,
          selector: { kind: 'brief', brief: 'A revised idea' },
        },
      },
    });
    render(
      <StoryboardDraftPage
        run={run}
        savePlan={vi.fn()}
        saveSource={saveSource}
        resetPlan={vi.fn()}
        approvePlan={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Brief'), {
      target: { value: 'A revised idea' },
    });
    fireEvent.click(screen.getByRole('link', { name: 'All storyboards' }));
    await waitFor(() =>
      expect(saveSource).toHaveBeenCalledWith(2, {
        kind: 'brief',
        brief: 'A revised idea',
      }),
    );
    expect(mocks.flush).toHaveBeenCalled();
    await waitFor(() => expect(mocks.push).toHaveBeenCalled());
  });
  it('keeps the editor visible and warns when save fails', async () => {
    mocks.flush.mockRejectedValue(new Error('Offline'));
    render(
      <StoryboardDraftPage
        run={run}
        savePlan={vi.fn()}
        resetPlan={vi.fn()}
        approvePlan={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('link', { name: 'All storyboards' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Retry saving before leaving',
      ),
    );
    expect(screen.getByText('Plan editor')).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it('renders a new storyboard that has no plan without creating an outbox', () => {
    render(
      <StoryboardDraftPage
        run={
          {
            ...run,
            config: {
              ...run.config,
              plan: undefined,
            },
          } satisfies StoryboardRun
        }
        savePlan={vi.fn()}
        resetPlan={vi.fn()}
        approvePlan={vi.fn()}
      />,
    );
    expect(screen.getByText('Plan editor')).toBeInTheDocument();
  });
});
