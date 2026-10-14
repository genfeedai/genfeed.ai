import {
  BreadcrumbLeafProvider,
  useBreadcrumbLeaf,
} from '@genfeedai/contexts/ui/breadcrumb-leaf-context';
import {
  ContextSidebarOutlet,
  ContextSidebarProvider,
  useContextSidebar,
} from '@genfeedai/contexts/ui/context-sidebar-context';
import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type { StoryboardRunCapabilities } from '@genfeedai/contracts/api-types/contracts/storyboard-run-capabilities.contract';
import type {
  StoryboardPlanEditorProps,
  StoryboardSelectProps,
} from '@genfeedai/props/studio/storyboard.props';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { preloadButtonTooltip } from '@ui/primitives/button-tooltip';
import type { ReactNode } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import StoryboardPlanEditor from './StoryboardPlanEditor';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const modal = vi.hoisted(() => ({ openConfirm: vi.fn() }));
// jsdom has no ResizeObserver; the Radix Slider in each shot card measures its thumb.
class MockResizeObserver {
  disconnect = vi.fn();
  observe = vi.fn();
  unobserve = vi.fn();
}
vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({
    useConfirmModal: () => ({ openConfirm: modal.openConfirm }),
    useGalleryModal: () => ({ openGallery: vi.fn() }),
  }),
);
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ prefetch: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
// The shell's sub-topbar: the editor's slots, without the shell providers.
vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    iconActions,
    leading,
    right,
  }: {
    children: ReactNode;
    iconActions?: ReactNode;
    leading?: ReactNode;
    right?: ReactNode;
  }) => (
    <div>
      <div data-testid="topbar-leading">{leading}</div>
      <div data-testid="topbar-actions">
        {iconActions}
        {right}
      </div>
      {children}
    </div>
  ),
}));
const getCharacterService = vi.hoisted(() => {
  const service = {
    replaceStoryboardCharacter: vi.fn(),
    listStoryboardCharacterReplacements: vi.fn(async () => ({
      operations: [],
      legacyReplacements: [],
    })),
    getStoryboardCharacterReplacementStatus: vi.fn(),
  };
  return vi.fn(async () => service);
});
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getCharacterService,
}));
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
  default: () => <div data-testid="animatic" />,
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
const emptyRun = {
  ...run,
  config: {
    ...run.config,
    plan: { ...run.config.plan, shots: [] },
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

function SidebarProbe() {
  const sidebar = useContextSidebar();
  return (
    <p data-testid="sidebar-selection">
      {sidebar?.selection
        ? `${sidebar.selection.kind}:${sidebar.selection.id}|${sidebar.selection.title}|${sidebar.selection.subtitle}`
        : 'none'}
    </p>
  );
}
function LeafProbe() {
  const leaf = useBreadcrumbLeaf();
  return (
    <p data-testid="breadcrumb-leaf">
      {leaf ? `${leaf.key}:${leaf.label}` : 'none'}
    </p>
  );
}
function renderEditor(props: Partial<StoryboardPlanEditorProps> = {}) {
  return render(
    <BreadcrumbLeafProvider>
      <ContextSidebarProvider>
        <StoryboardPlanEditor
          run={run}
          savePlan={vi.fn(update)}
          resetPlan={vi.fn()}
          approvePlan={vi.fn()}
          capabilities={capabilities([5])}
          {...props}
        />
        <ContextSidebarOutlet testId="inspector" />
        <SidebarProbe />
        <LeafProbe />
      </ContextSidebarProvider>
    </BreadcrumbLeafProvider>,
  );
}
async function openTab(name: RegExp) {
  await userEvent.click(
    within(screen.getByTestId('inspector')).getByRole('tab', { name }),
  );
}

describe('persisted storyboard plan editor', () => {
  beforeAll(async () => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    // Tooltip buttons swap their DOM node once the tooltip loads; settle that first.
    await preloadButtonTooltip();
  });
  beforeEach(() => {
    modal.openConfirm.mockReset();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('flushes a dirty plan before approving the returned revision', async () => {
    const save = vi.fn(update);
    const approve = vi.fn().mockResolvedValue(run);
    renderEditor({ savePlan: save, approvePlan: approve });
    await openTab(/^Details/);
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
    renderEditor({ run: selected, savePlan: save, approvePlan: approve });
    await openTab(/^Cast/);
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
    await openTab(/^Details/);
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Kept while replacing voice' },
    });
    await waitFor(
      () => expect(screen.getByText('Save failed')).toBeInTheDocument(),
      { timeout: 2500 },
    );
    expect(save).not.toHaveBeenCalled();
    await openTab(/^Cast/);
    fireEvent.change(screen.getByLabelText('Voice for Narrator'), {
      target: { value: '__none' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Approve storyboard' }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][1].cast[0].voiceId).toBeUndefined();
    expect(save.mock.calls[0][1].title).toBe('Kept while replacing voice');
  });
  it('retains the previous duration when a slider change exceeds the runtime budget', async () => {
    renderEditor({ capabilities: capabilities([5, 10]) });
    const [firstSlider] = screen.getAllByRole('slider', {
      name: 'Shot 1 length in seconds',
    });
    await act(async () => {
      fireEvent.keyDown(firstSlider, { key: 'ArrowRight' });
    });
    expect(screen.getByTestId('shot-duration-1')).toHaveTextContent('5 s');
    expect(screen.getByRole('alert')).toHaveTextContent('Shorten another shot');
  });
  it('retains dirty text and blocks approval after a failed save', async () => {
    const approve = vi.fn();
    renderEditor({
      savePlan: vi.fn().mockRejectedValue(new Error('Revision conflict')),
      approvePlan: approve,
    });
    await openTab(/^Details/);
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

  describe('board and sidebar', () => {
    it('puts the plan settings in the sidebar and only shot cards on the board', () => {
      renderEditor();
      expect(screen.getByTestId('animatic')).toBeInTheDocument();
      expect(
        screen.getAllByRole('region', { name: /^Shot \d+$/ }),
      ).toHaveLength(2);
      expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Logline')).not.toBeInTheDocument();
      const inspector = within(screen.getByTestId('inspector'));
      expect(
        inspector.getByRole('button', { name: 'Go to shot 2: Shot 2' }),
      ).toBeInTheDocument();
      expect(screen.getByTestId('sidebar-selection')).toHaveTextContent(
        'run:run|Plan|Storyboard · draft',
      );
    });
    it('keeps the settings together under Details, references and cast under their own tabs', async () => {
      renderEditor();
      await openTab(/^Details/);
      const details = within(screen.getByTestId('storyboard-details'));
      expect(details.getByLabelText('Title')).toHaveValue('Plan');
      expect(details.getByLabelText('Logline')).toHaveValue('A scene');
      expect(details.getByLabelText('Video model')).toBeInTheDocument();
      expect(details.getByLabelText('Format')).toBeInTheDocument();
      expect(details.getByLabelText('Runtime budget (seconds)')).toHaveValue(
        10,
      );
      await openTab(/^References/);
      expect(screen.getByTestId('storyboard-references')).toBeInTheDocument();
      await openTab(/^Cast/);
      expect(screen.getByTestId('storyboard-cast')).toBeInTheDocument();
    });
    it('scrolls to a shot picked from the sidebar and marks it selected', async () => {
      renderEditor();
      await userEvent.click(
        screen.getByRole('button', { name: 'Go to shot 2: Shot 2' }),
      );
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'start',
      });
      expect(screen.getByRole('region', { name: 'Shot 2' })).toHaveAttribute(
        'data-selected',
        'true',
      );
    });
    it('lists the runtime used and the shots in the sub-topbar meter', () => {
      renderEditor();
      const meter = within(screen.getByTestId('topbar-leading'));
      expect(meter.getByText('10s / 10s')).toBeInTheDocument();
      expect(meter.getByText('2 shots · 9:16')).toBeInTheDocument();
    });
    it('names the breadcrumb leaf and the sidebar after the plan title as it is edited', async () => {
      renderEditor();
      expect(screen.getByTestId('breadcrumb-leaf')).toHaveTextContent(
        'run:Plan',
      );
      await openTab(/^Details/);
      fireEvent.change(screen.getByLabelText('Title'), {
        target: { value: 'The Founder Story' },
      });
      expect(screen.getByTestId('breadcrumb-leaf')).toHaveTextContent(
        'run:The Founder Story',
      );
      expect(screen.getByTestId('sidebar-selection')).toHaveTextContent(
        'The Founder Story',
      );
    });
  });

  describe('sub-topbar actions', () => {
    it('keeps Undo and Reset as labelled icon actions and Approve last', () => {
      renderEditor();
      const actions = screen.getByTestId('topbar-actions');
      const buttons = within(actions)
        .getAllByRole('button')
        .map(
          (button) => button.getAttribute('aria-label') ?? button.textContent,
        );
      expect(buttons).toEqual(['Undo', 'Reset plan', 'Approve storyboard']);
    });
    it('renders page actions before the primary action', () => {
      renderEditor({ actions: <a href="/editor">Open in Editor</a> });
      const actions = within(screen.getByTestId('topbar-actions'));
      const link = actions.getByRole('link', { name: 'Open in Editor' });
      const approve = actions.getByRole('button', {
        name: 'Approve storyboard',
      });
      expect(
        link.compareDocumentPosition(approve) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
    it('confirms before resetting the plan to the generated draft', async () => {
      const reset = vi.fn().mockResolvedValue(run);
      renderEditor({
        run: {
          ...run,
          config: { ...run.config, generatedPlan: run.config.plan },
        },
        resetPlan: reset,
      });
      fireEvent.click(screen.getByRole('button', { name: 'Reset plan' }));
      expect(modal.openConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ confirmLabel: 'Reset plan' }),
      );
      await act(async () => {
        await modal.openConfirm.mock.calls[0][0].onConfirm();
      });
      expect(reset).toHaveBeenCalledWith(1);
    });
  });

  describe('shot cards', () => {
    it('inserts a shot between two shots from the seam', async () => {
      const roomy = {
        ...run,
        config: {
          ...run.config,
          plan: { ...run.config.plan, runtimeBudgetSeconds: 20 },
        },
      };
      renderEditor({ run: roomy });
      fireEvent.click(
        screen.getByRole('button', { name: 'Insert shot after shot 1' }),
      );
      const sections = await screen.findAllByRole('region', {
        name: /^Shot \d+$/,
      });
      expect(sections).toHaveLength(3);
      expect(within(sections[1]).getByLabelText('Action')).toHaveValue('');
    });
    it('refuses to insert a shot when the budget has no room', () => {
      renderEditor();
      fireEvent.click(
        screen.getByRole('button', { name: 'Insert shot after shot 1' }),
      );
      expect(screen.getByRole('alert')).toHaveTextContent('No room');
      expect(
        screen.getAllByRole('region', { name: /^Shot \d+$/ }),
      ).toHaveLength(2);
    });
    it('changes the transition at the seam through the shared select', () => {
      const save = vi.fn(update);
      renderEditor({ savePlan: save });
      fireEvent.change(screen.getByLabelText('Shot 1 transition'), {
        target: { value: 'stitch' },
      });
      expect(screen.getByLabelText('Shot 1 transition')).toHaveValue('stitch');
    });
    it('edits the action and dialogue and flags the stale still', () => {
      renderEditor();
      const first = within(screen.getByRole('region', { name: 'Shot 1' }));
      fireEvent.change(first.getByLabelText('Action'), {
        target: { value: 'Turn around' },
      });
      expect(first.getByLabelText('Action')).toHaveValue('Turn around');
      expect(first.getByText('Still: stale')).toBeInTheDocument();
      fireEvent.change(first.getByLabelText('Dialogue'), {
        target: { value: 'Hello' },
      });
      expect(first.getByLabelText('Dialogue')).toHaveValue('Hello');
    });
    it('names a shot inline', async () => {
      renderEditor();
      await userEvent.click(
        screen.getByRole('button', { name: 'Name for shot 1' }),
      );
      const input = screen.getByRole('textbox', { name: 'Name for shot 1' });
      await userEvent.type(input, 'The problem{Enter}');
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Name for shot 1' }),
        ).toHaveTextContent('The problem'),
      );
      expect(
        within(screen.getByTestId('inspector')).getByRole('button', {
          name: 'Go to shot 1: The problem',
        }),
      ).toBeInTheDocument();
    });
    it('moves and deletes a shot from its actions menu', async () => {
      const user = userEvent.setup();
      renderEditor();
      await user.click(screen.getByRole('button', { name: 'Shot 2 actions' }));
      expect(
        await screen.findByRole('menuitem', { name: 'Move shot 2 down' }),
      ).toHaveAttribute('aria-disabled', 'true');
      await user.click(
        screen.getByRole('menuitem', { name: 'Move shot 2 up' }),
      );
      await user.click(screen.getByRole('button', { name: 'Shot 1 actions' }));
      await user.click(
        await screen.findByRole('menuitem', { name: 'Delete shot' }),
      );
      expect(
        screen.getAllByRole('region', { name: /^Shot \d+$/ }),
      ).toHaveLength(1);
    });
    it('opens the character replacement form from the card footer', async () => {
      renderEditor();
      const first = within(screen.getByRole('region', { name: 'Shot 1' }));
      expect(first.queryByLabelText('Prompt')).not.toBeInTheDocument();
      await userEvent.click(
        first.getByRole('button', { name: 'Replace character' }),
      );
      expect(first.getByLabelText('Prompt')).toBeInTheDocument();
    });
  });

  describe('drafting and the empty board', () => {
    it('shows a skeleton and pauses approval while a plan is being drafted', () => {
      renderEditor({ isDrafting: true });
      expect(screen.getByText('Drafting the storyboard…')).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: /^Shot / })).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Approve storyboard' }),
      ).toBeDisabled();
      expect(screen.getByTestId('sidebar-selection')).toHaveTextContent(
        'Storyboard · drafting',
      );
    });
    it('asks for a brief when there are no shots', () => {
      renderEditor({ run: emptyRun });
      expect(screen.getByText('Start with the story')).toBeInTheDocument();
      expect(screen.queryByTestId('animatic')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Draft from the saved brief' }),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId('sidebar-selection')).toHaveTextContent(
        'Storyboard · brief',
      );
    });
    it('offers to draft from a brief that is already saved', () => {
      const draftFromBrief = vi.fn();
      renderEditor({
        run: emptyRun,
        sourceBrief: 'Idea',
        onDraftFromBrief: draftFromBrief,
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Draft from the saved brief' }),
      );
      expect(draftFromBrief).toHaveBeenCalledOnce();
    });
    it('keeps the brief readable, never editable, under Details', async () => {
      renderEditor({ sourceBrief: 'A founder story' });
      await openTab(/^Details/);
      expect(screen.getByLabelText('Brief')).toHaveValue('A founder story');
      expect(screen.getByLabelText('Brief')).toHaveAttribute('readonly');
    });
    it('renders the composer slot and notices around the board', () => {
      renderEditor({
        composer: <div data-testid="composer-slot" />,
        notices: <p role="status">Heads up</p>,
      });
      expect(screen.getByTestId('composer-slot')).toBeInTheDocument();
      expect(screen.getByText('Heads up')).toBeInTheDocument();
    });
  });
});
