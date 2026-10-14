import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type {
  StoryboardPlanEditorProps,
  StoryboardPromptBarProps,
} from '@genfeedai/props/studio/storyboard.props';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
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
// A settled outbox queue, so the page is not waiting on storage.
vi.mock(
  '@pages/studio/storyboard/hooks/use-storyboard-autosave',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@pages/studio/storyboard/hooks/use-storyboard-autosave')
      >();
    return {
      ...actual,
      useStoryboardDraftOutbox: () => ({
        queue: { choose: vi.fn(), resolve: vi.fn() },
        snapshot: { status: 'saved', revision: 1, conflicts: [], choices: {} },
        plan: undefined,
        source: undefined,
      }),
    };
  },
);
vi.mock(
  '@pages/studio/storyboard/components/StoryboardPlanEditor',
  async () => {
    const { useImperativeHandle } = await import('react');
    return {
      default: ({
        ref,
        actions,
        composer,
        isDrafting,
        notices,
        onDraftFromBrief,
        sourceBrief,
      }: StoryboardPlanEditorProps) => {
        useImperativeHandle(ref, () => ({ flush: mocks.flush }));
        return (
          <div>
            <p>Plan editor</p>
            {isDrafting ? <p>Drafting</p> : null}
            <p data-testid="source-brief">{sourceBrief}</p>
            {onDraftFromBrief ? (
              <button type="button" onClick={onDraftFromBrief}>
                Draft saved brief
              </button>
            ) : null}
            {actions}
            {notices}
            {composer}
          </div>
        );
      },
    };
  },
);
vi.mock('@pages/studio/storyboard/components/StoryboardPromptBar', async () => {
  const { useState } = await import('react');
  return {
    default: ({
      error,
      hasShots,
      isDisabled,
      onRetry,
      onSubmit,
    }: StoryboardPromptBarProps) => {
      const [value, setValue] = useState('');
      return (
        <div>
          <textarea
            aria-label={hasShots ? 'Changes' : 'Brief'}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <button
            type="button"
            disabled={isDisabled}
            onClick={() => void onSubmit(value)}
          >
            Send
          </button>
          {error ? <p role="alert">{error}</p> : null}
          {error ? (
            <button type="button" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      );
    },
  };
});
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
const emptyRun = {
  ...run,
  config: { ...run.config, plan: { ...run.config.plan, shots: [] } },
} satisfies StoryboardRun;
const readyRun = {
  ...run,
  config: {
    ...run.config,
    state: 'ready' as const,
    scenePipeline: {
      state: 'ready',
      scenes: {
        'shot-1': { video: { state: 'ready', assetId: 'clip-1' } },
        'shot-2': { video: { state: 'ready', assetId: 'clip-2' } },
      },
    },
  },
} as unknown as StoryboardRun;
function savedBrief(brief: string): StoryboardRun {
  return {
    ...emptyRun,
    config: {
      ...emptyRun.config,
      revision: 2,
      sourceSnapshot: {
        ...emptyRun.config.sourceSnapshot,
        selector: { kind: 'brief', brief },
      },
    },
  };
}
function renderPage(
  props: Partial<Parameters<typeof StoryboardDraftPage>[0]> = {},
) {
  return render(
    <StoryboardDraftPage
      run={run}
      savePlan={vi.fn()}
      resetPlan={vi.fn()}
      approvePlan={vi.fn()}
      draftPlan={vi.fn().mockResolvedValue(run)}
      {...props}
    />,
  );
}
describe('draft detail page', () => {
  beforeEach(() => {
    mocks.flush.mockReset();
    mocks.push.mockReset();
    mocks.flush.mockResolvedValue({ revision: 1, value: run.config.plan });
  });

  describe('opening the editor', () => {
    it('has no back button; the breadcrumb root links to the list', () => {
      renderPage();
      expect(
        screen.queryByRole('link', { name: 'All storyboards' }),
      ).not.toBeInTheDocument();
      expect(screen.getByText('Plan editor')).toBeInTheDocument();
    });
    it('waits for the save before opening a finished storyboard in the editor', async () => {
      let finish: (() => void) | undefined;
      mocks.flush.mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = () => resolve({ revision: 1, value: run.config.plan });
          }),
      );
      renderPage({ run: readyRun });
      const link = screen.getByRole('link', { name: 'Open in Editor' });
      expect(link).toHaveAttribute(
        'href',
        expect.stringContaining('/org/brand/studio/editor/new?'),
      );
      fireEvent.click(link);
      expect(mocks.push).not.toHaveBeenCalled();
      await waitFor(() => expect(mocks.flush).toHaveBeenCalled());
      finish?.();
      await waitFor(() =>
        expect(mocks.push).toHaveBeenCalledWith(
          expect.stringContaining('/org/brand/studio/editor/new?'),
        ),
      );
    });
    it('keeps the editor visible and warns when save fails', async () => {
      mocks.flush.mockRejectedValue(new Error('Offline'));
      renderPage({ run: readyRun });
      fireEvent.click(screen.getByRole('link', { name: 'Open in Editor' }));
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Retry saving before leaving',
        ),
      );
      expect(screen.getByText('Plan editor')).toBeInTheDocument();
      expect(mocks.push).not.toHaveBeenCalled();
    });
    it('renders a migrated storyboard that has no plan without creating an outbox', () => {
      renderPage({
        run: {
          ...run,
          config: {
            ...run.config,
            origin: 'migrated',
            importedPresentation: null,
            migration: {
              version: 1,
              sourceContract: 'brand-remix-run',
              sourceVersion: 1,
              sourceConfigHash: 'b'.repeat(64),
              migratedAt: run.updatedAt,
              converterVersion: 1,
            },
            migrationReview: {
              status: 'required',
              issues: [{ code: 'LEGACY_PLAN_UNREPRESENTABLE', path: 'plan' }],
            },
            plan: null,
          },
        } satisfies StoryboardRun,
      });
      expect(screen.getByText('Plan editor')).toBeInTheDocument();
    });
  });

  describe('prompt bar', () => {
    it('offers the brief while the plan has no shots and change requests once it has', () => {
      const { rerender } = renderPage({
        run: emptyRun,
        saveSource: vi.fn(),
      });
      expect(screen.getByLabelText('Brief')).toBeInTheDocument();
      rerender(
        <StoryboardDraftPage
          run={run}
          savePlan={vi.fn()}
          saveSource={vi.fn()}
          resetPlan={vi.fn()}
          approvePlan={vi.fn()}
          draftPlan={vi.fn()}
        />,
      );
      expect(screen.getByLabelText('Changes')).toBeInTheDocument();
    });
    it('is absent once the storyboard is generating, or when the source cannot be edited', () => {
      renderPage({ run: readyRun, saveSource: vi.fn() });
      expect(screen.queryByLabelText('Changes')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Brief')).not.toBeInTheDocument();
      renderPage({ run: emptyRun });
      expect(screen.queryByLabelText('Brief')).not.toBeInTheDocument();
    });
    it('saves the brief, settles pending plan edits, then drafts the plan', async () => {
      let finishDraft: ((value: StoryboardRun) => void) | undefined;
      const draftPlan = vi.fn(
        () =>
          new Promise<StoryboardRun>((resolve) => {
            finishDraft = resolve;
          }),
      );
      const saveSource = vi
        .fn()
        .mockResolvedValue(savedBrief('A founder story'));
      renderPage({ run: emptyRun, saveSource, draftPlan });
      fireEvent.change(screen.getByLabelText('Brief'), {
        target: { value: 'A founder story' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      await waitFor(() => expect(draftPlan).toHaveBeenCalledWith(undefined));
      expect(saveSource).toHaveBeenCalledWith(1, {
        kind: 'brief',
        brief: 'A founder story',
      });
      expect(saveSource.mock.invocationCallOrder[0]).toBeLessThan(
        draftPlan.mock.invocationCallOrder[0],
      );
      expect(Math.max(...mocks.flush.mock.invocationCallOrder)).toBeLessThan(
        draftPlan.mock.invocationCallOrder[0],
      );
      expect(screen.getByText('Drafting')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
      await act(async () => finishDraft?.(run));
      await waitFor(() =>
        expect(screen.queryByText('Drafting')).not.toBeInTheDocument(),
      );
    });
    it('sends a change request to the existing plan without touching the brief', async () => {
      const draftPlan = vi.fn().mockResolvedValue(run);
      const saveSource = vi.fn();
      renderPage({ saveSource, draftPlan });
      fireEvent.change(screen.getByLabelText('Changes'), {
        target: { value: 'Make shot 2 shorter' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      await waitFor(() =>
        expect(draftPlan).toHaveBeenCalledWith('Make shot 2 shorter'),
      );
      expect(saveSource).not.toHaveBeenCalled();
      expect(mocks.flush).toHaveBeenCalled();
    });
    it('ignores an empty prompt', () => {
      const draftPlan = vi.fn();
      renderPage({ saveSource: vi.fn(), draftPlan });
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      expect(draftPlan).not.toHaveBeenCalled();
    });
    it('reports a failed draft and retries the same request', async () => {
      const draftPlan = vi
        .fn()
        .mockRejectedValueOnce(new Error('Model unavailable'))
        .mockResolvedValueOnce(run);
      renderPage({ saveSource: vi.fn(), draftPlan });
      fireEvent.change(screen.getByLabelText('Changes'), {
        target: { value: 'Add a hook' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Model unavailable',
        ),
      );
      expect(screen.queryByText('Drafting')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(draftPlan).toHaveBeenCalledTimes(2));
      expect(draftPlan).toHaveBeenLastCalledWith('Add a hook');
      await waitFor(() =>
        expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
      );
    });
    it('drafts from the brief that is already saved', async () => {
      const draftPlan = vi.fn().mockResolvedValue(run);
      const saveSource = vi.fn();
      renderPage({ run: emptyRun, saveSource, draftPlan });
      expect(screen.getByTestId('source-brief')).toHaveTextContent('Idea');
      fireEvent.click(
        screen.getByRole('button', { name: 'Draft saved brief' }),
      );
      await waitFor(() => expect(draftPlan).toHaveBeenCalledWith(undefined));
      expect(saveSource).not.toHaveBeenCalled();
    });
  });
});
