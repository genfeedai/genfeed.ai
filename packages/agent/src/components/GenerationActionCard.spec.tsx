import '@agent-tests/media-preview-mocks';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useAgentWorkObjectGateStore } from '@genfeedai/agent/stores/agent-work-object-gate.store';
import {
  ModelCategory,
  ModelProvider,
  RouterPriority,
} from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { copyToClipboard } = vi.hoisted(() => ({
  copyToClipboard: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@genfeedai/services/core/clipboard.service', () => ({
  ClipboardService: {
    getInstance: () => ({ copyToClipboard }),
  },
}));

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) => {
      const template =
        {
          acceptFullRun: 'Accept full run',
          acceptFullRunAria:
            'Accept the pilot and generate the full-length video',
          decline: 'Decline',
          declineAria: 'Decline this generation',
          declined: 'Declined — no credits were charged.',
          durationSeconds: '{seconds}s',
          estimateUnavailable: 'Estimate unavailable',
          estimatedCredits: '~{credits} credits',
          generateAria: 'Generate image',
          generateTooltip: 'Generate',
          generateVideoAria: 'Generate video',
          loadingModels: 'Loading Genfeed models…',
          noModelsEnabled: 'No models enabled',
          noModelsEnabledTitle: 'No models enabled for this workspace',
          openInStudio: 'Open in Studio',
          openInStudioAria: 'Open this generation in Studio',
          pilotCeilingReached:
            'Stopped after {count} rejected paid candidates. No further video generation will run for this clip.',
          pilotReady: 'Pilot ready',
          pilotReviewTitle:
            'Review this {seconds}s pilot before the full-length run',
          previewDescription: 'Read and edit the full generation prompt',
          previewEditorAria: 'Full prompt',
          previewTitle: 'Prompt',
          promptLabel: 'Prompt',
          readFull: 'Read & edit',
          resolvedModel: 'Model: {model}',
          readFullAria: 'Read and edit the full prompt',
          rejectPilot: 'Reject',
          rejectPilotAria: 'Reject this pilot',
          stop: 'Stop',
          stopAria: 'Stop generation',
        }[key] ?? key;
      return template.replace(/\{(\w+)\}/g, (token, name: string) =>
        values?.[name] === undefined ? token : String(values[name]),
      );
    },
}));

vi.mock('@helpers/generation-controls.helper', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@helpers/generation-controls.helper')
    >();

  return {
    ...actual,
    resolveGenerationModelControls: (
      model: IModel | null,
      generationType: 'image' | 'video',
    ) => ({
      availableAspectRatios: model?.aspectRatios?.length
        ? [...model.aspectRatios]
        : ['1:1', '16:9', '9:16', '4:3', '3:4'],
      defaultAspectRatio:
        model?.defaultAspectRatio ?? model?.aspectRatios?.[0] ?? '1:1',
      defaultDuration: model?.defaultDuration ?? 5,
      durationOptions:
        generationType === 'video'
          ? model?.durations?.length
            ? [...model.durations]
            : [5, 10]
          : [],
      showDuration: generationType === 'video',
    }),
  };
});

vi.mock('@ui/dropdowns/model-selector/useModelFavorites', () => ({
  useModelFavorites: () => ({
    favoriteModelKeys: [],
    onFavoriteToggle: vi.fn(),
  }),
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: function MockButton(props: {
    children?: ReactNode;
    onClick?: () => void;
  }) {
    return (
      <button type="button" onClick={props.onClick}>
        {props.children}
      </button>
    );
  },
}));

const capturedModelSelectorPopoverProps: {
  autoLabel?: string;
  models?: IModel[];
  onChange?: (_name: string, values: string[]) => void;
  onPrioritizeChange?: (prioritize: RouterPriority) => void;
  prioritize?: RouterPriority;
  selectionMode?: 'multi' | 'single';
  values?: string[];
} = {};

vi.mock('@ui/dropdowns/model-selector/ModelSelectorPopover', () => ({
  default: (props: {
    autoLabel?: string;
    models: IModel[];
    onChange?: (_name: string, values: string[]) => void;
    onPrioritizeChange?: (prioritize: RouterPriority) => void;
    prioritize?: RouterPriority;
    selectionMode?: 'multi' | 'single';
    values: string[];
  }) => {
    capturedModelSelectorPopoverProps.autoLabel = props.autoLabel;
    capturedModelSelectorPopoverProps.models = props.models;
    capturedModelSelectorPopoverProps.onChange = props.onChange;
    capturedModelSelectorPopoverProps.onPrioritizeChange =
      props.onPrioritizeChange;
    capturedModelSelectorPopoverProps.prioritize = props.prioritize;
    capturedModelSelectorPopoverProps.selectionMode = props.selectionMode;
    capturedModelSelectorPopoverProps.values = props.values;

    return <div data-testid="model-selector-popover">{props.autoLabel}</div>;
  },
}));

vi.mock('@ui/dropdowns/aspect-ratio/AspectRatioDropdown', () => ({
  default: ({ placeholder }: { placeholder?: string }) => (
    <div data-testid="button-dropdown">{placeholder}</div>
  ),
}));

vi.mock('@ui/buttons/dropdown/button-dropdown/ButtonDropdown', () => ({
  default: ({
    onChange,
    options,
    tooltip,
    value,
  }: {
    onChange: (name: string, value: string) => void;
    options: Array<{ label: string; value: string }>;
    tooltip?: string;
    value?: string;
  }) => (
    <div data-testid="outputs-button-dropdown">
      <button type="button" aria-label={tooltip ?? 'Number of outputs'}>
        {value}x
      </button>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange('outputs', option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
}));

const { selectHarness } = vi.hoisted(() => ({
  selectHarness: {
    onValueChange: undefined as ((value: string) => void) | undefined,
    value: undefined as string | undefined,
  },
}));

vi.mock('@ui/primitives/select', () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children: ReactNode;
    onValueChange?: (value: string) => void;
    value?: string;
  }) => {
    selectHarness.onValueChange = onValueChange;
    selectHarness.value = value;
    return (
      <div data-testid="select" data-value={value}>
        {children}
      </div>
    );
  },
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <button onClick={() => selectHarness.onValueChange?.(value)} type="button">
      {children}
    </button>
  ),
  SelectTrigger: ({ children, id }: { children: ReactNode; id?: string }) => (
    <button
      aria-label={id === 'gen-action-outputs' ? 'Number of outputs' : undefined}
      id={id}
      type="button"
    >
      {id === 'gen-action-outputs' && selectHarness.value
        ? `${selectHarness.value}x`
        : children}
    </button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
}));

const { brandState, orgUrlParams, storeState } = vi.hoisted(() => ({
  brandState: {
    // #4670 Open in Studio requires a brand to hand off to — every fixture
    // in this file is scoped to one brand, so this is never blank.
    brandId: 'brand-1',
    organizationId: '',
    // Fallback brand for `useOrgUrl().activeHref` when the route itself
    // carries no brand segment (#4716 P0 — the org-level Agent workspace).
    selectedBrand: { slug: 'test-brand' },
    settings: null as { enabledModelIds?: string[] } | null,
    settingsLoading: false,
  },
  // Mutable so a single test can simulate the org-level Agent workspace
  // route (`/:orgSlug/~/agent`, no brand segment) without affecting the rest
  // of this file's fixtures, which stay on the default brand-scoped route.
  orgUrlParams: { brandSlug: 'test-brand', orgSlug: 'test-org' },
  storeState: {
    activeThreadId: 'thread-1',
    error: null as string | null,
    setError: vi.fn(),
    setThreadUiBusy: vi.fn(),
  },
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => brandState,
}));

// Overrides the package-wide `next/navigation` mock (tests/setup.ts) with a
// mutable `useParams` so the #4716 P0 regression test below can simulate a
// route with no brand segment.
vi.mock('next/navigation', () => ({
  useParams: () => orgUrlParams,
  usePathname: () => '/',
  useRouter: () => ({
    back: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@genfeedai/agent/stores/agent-chat.store', () => ({
  useAgentChatStore: Object.assign(
    (selector: (state: typeof storeState) => unknown) => selector(storeState),
    { getState: () => storeState },
  ),
}));

import { buildDefaultAgentGenerationSetupValues } from '@genfeedai/agent/utils/agent-generation-setup.util';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import {
  buildAgentGenerationSetupScope,
  setGenerationSetupField,
  useGenerationSetupStore,
} from '@ui/dropdowns/generation-setup/generation-setup.store';
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import { GenerationActionCard } from './GenerationActionCard';

interface AgentGenerationScopeParams {
  generationType: 'image' | 'video';
  threadId: string | null;
}

function writePreferredGenerationModel(
  value: string,
  scopeParams: AgentGenerationScopeParams,
): void {
  const scope = buildAgentGenerationSetupScope(
    scopeParams.threadId,
    scopeParams.generationType,
  );
  const defaults = buildDefaultAgentGenerationSetupValues(
    scopeParams.generationType,
  );
  setGenerationSetupField(
    scope,
    'modelKey',
    value === AUTO_MODEL_OPTION_VALUE ? '' : value,
    defaults,
  );
}

function writePreferredGenerationOutputs(
  value: number,
  scopeParams: AgentGenerationScopeParams,
): void {
  const scope = buildAgentGenerationSetupScope(
    scopeParams.threadId,
    scopeParams.generationType,
  );
  const defaults = buildDefaultAgentGenerationSetupValues(
    scopeParams.generationType,
  );
  setGenerationSetupField(scope, 'outputs', value, defaults);
}

function writePreferredGenerationPriority(
  value: RouterPriority,
  scopeParams: AgentGenerationScopeParams,
): void {
  const scope = buildAgentGenerationSetupScope(
    scopeParams.threadId,
    scopeParams.generationType,
  );
  const defaults = buildDefaultAgentGenerationSetupValues(
    scopeParams.generationType,
  );
  setGenerationSetupField(scope, 'prioritize', value, defaults);
}

function createModel(
  overrides: Partial<IModel> & Pick<IModel, 'key' | 'label'>,
): IModel {
  return {
    category: ModelCategory.IMAGE,
    cost: 1,
    createdAt: '2026-01-01',
    id: overrides.key,
    isActive: true,
    isDefault: false,
    isDeleted: false,
    key: overrides.key,
    label: overrides.label,
    provider: ModelProvider.REPLICATE,
    updatedAt: '2026-01-01',
    ...overrides,
  } as IModel;
}

function createApiServiceMock(options?: {
  createPrompt?: ReturnType<typeof vi.fn>;
  createStudioHandoff?: ReturnType<typeof vi.fn>;
  estimateGenerationCredits?: ReturnType<typeof vi.fn>;
  generateIngredient?: ReturnType<typeof vi.fn>;
  models?: IModel[];
}) {
  const createPrompt =
    options?.createPrompt ?? vi.fn().mockResolvedValue({ id: 'prompt-1' });
  const generateIngredient =
    options?.generateIngredient ??
    vi.fn().mockResolvedValue({
      id: 'image-1',
      url: 'https://cdn.test/image.png',
    });
  const estimateGenerationCredits =
    options?.estimateGenerationCredits ??
    vi
      .fn()
      .mockResolvedValue({ credits: null, isAvailable: true, modelKey: null });
  const createStudioHandoff =
    options?.createStudioHandoff ??
    vi.fn().mockResolvedValue({ id: 'handoff-1' });
  const models = options?.models ?? [];

  return {
    baseUrl: 'http://genfeed.localhost:3010',
    createPrompt: vi.fn((...args: unknown[]) => createPrompt(...args)),
    createStudioHandoff: vi.fn((...args: unknown[]) =>
      createStudioHandoff(...args),
    ),
    estimateGenerationCredits: vi.fn((...args: unknown[]) =>
      estimateGenerationCredits(...args),
    ),
    generateIngredient: vi.fn((...args: unknown[]) =>
      generateIngredient(...args),
    ),
    getModels: vi.fn(() => Promise.resolve(models)),
  };
}

function renderGenerationActionCard(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false } },
  });

  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

describe('GenerationActionCard', () => {
  it('blocks generation before work objects load and enables it after an empty result', async () => {
    useAgentWorkObjectGateStore.setState({ threads: {} });
    const apiService = createApiServiceMock();
    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: { prompt: 'A portrait.' },
          generationType: 'image',
          id: 'gated-action',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={apiService}
      />,
    );
    const generate = await screen.findByRole('button', {
      name: /generate image/i,
    });
    expect(generate).toBeDisabled();
    fireEvent.click(generate);
    expect(apiService.createPrompt).not.toHaveBeenCalled();
    expect(apiService.generateIngredient).not.toHaveBeenCalled();
    await act(async () =>
      useAgentWorkObjectGateStore.getState().setObjects('thread-1', []),
    );
    expect(generate).toBeEnabled();
  });

  it('can start as a compact inferred-mode strip and reveal settings on demand', async () => {
    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: { prompt: 'A launch-day portrait.' },
          generationType: 'image',
          id: 'action-collapsed-mode-strip',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock()}
        defaultCollapsed
      />,
    );

    expect(screen.queryByRole('textbox', { name: 'Prompt' })).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Expand generation card' }),
    );
    expect(
      await screen.findByRole('textbox', { name: 'Prompt' }),
    ).toBeVisible();
  });

  it('resolves prompt editor copy through the host agent catalog', () => {
    const source = readFileSync(
      join(__dirname, 'GenerationActionCardControls.tsx'),
      'utf8',
    );
    expect(source).toContain("useTranslations('agent.generationActionCard')");
    expect(source).toContain("translate('promptLabel')");
    expect(source).toContain("translate('loadingModels')");
    expect(source).toContain("translate('noModelsEnabled')");
    expect(source).toContain("translate('durationSeconds'");
    expect(source).not.toContain('{option}s');
    expect(source).not.toContain('const COPY =');
    expect(source).toContain('ButtonDropdown');
    expect(source).toContain('name="outputs"');
    expect(source).not.toContain('id="gen-action-outputs"');
    expect(source).toContain('ArrowUp');
    expect(source).not.toContain('Play');
    expect(source).not.toContain('Generate {isImage');
  });

  it('uses the prompt-bar send control and a single unlabeled toolbar row', async () => {
    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: {
            prompt: 'Editorial portrait with restrained studio lighting.',
          },
          generationType: 'image',
          id: 'action-prompt-bar-send',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock()}
      />,
    );

    const send = await screen.findByRole('button', { name: 'Generate image' });
    expect(send).toHaveAttribute('aria-label', 'Generate image');
    expect(send).not.toHaveTextContent(/generate image/i);
    expect(screen.queryByText('Model')).not.toBeInTheDocument();
    expect(screen.queryByText('Aspect Ratio')).not.toBeInTheDocument();
    expect(screen.queryByText('Outputs')).not.toBeInTheDocument();
  });

  beforeEach(() => {
    brandState.organizationId = '';
    brandState.selectedBrand = { slug: 'test-brand' };
    brandState.settings = null;
    brandState.settingsLoading = false;
    orgUrlParams.brandSlug = 'test-brand';
    orgUrlParams.orgSlug = 'test-org';
    storeState.activeThreadId = 'thread-1';
    useAgentWorkObjectGateStore.setState({ threads: {} });
    useAgentWorkObjectGateStore.getState().setObjects('thread-1', []);
    storeState.error = null;
    storeState.setError.mockReset();
    storeState.setThreadUiBusy.mockReset();
    capturedModelSelectorPopoverProps.autoLabel = undefined;
    capturedModelSelectorPopoverProps.models = undefined;
    capturedModelSelectorPopoverProps.onChange = undefined;
    capturedModelSelectorPopoverProps.onPrioritizeChange = undefined;
    capturedModelSelectorPopoverProps.prioritize = undefined;
    capturedModelSelectorPopoverProps.selectionMode = undefined;
    capturedModelSelectorPopoverProps.values = undefined;
    window.localStorage.clear();
    act(() => {
      useGenerationSetupStore.setState({
        reasonsByScope: {},
        setupByScope: {},
      });
    });
  });

  it('keeps the prompt field compact and opens an editable full prompt', async () => {
    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: {
            prompt:
              'SCENE: Professional boxing ring. SUBJECT: Athletic boxer in black gear. BACKGROUND: Blurred arena crowd. LIGHTING: Dramatic overhead spotlights. STYLE: Photorealistic sports photography. NEGATIVE: No text or watermarks.',
          },
          generationType: 'image',
          id: 'action-preview',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock()}
      />,
    );

    const compactPrompt = await screen.findByRole('textbox', {
      name: 'Prompt',
    });
    expect(compactPrompt).toHaveAttribute('rows', '1');

    const readEdit = screen.getByRole('button', {
      name: 'Read and edit the full prompt',
    });
    expect(compactPrompt.parentElement).toContainElement(readEdit);

    fireEvent.click(readEdit);

    const fullPrompt = await screen.findByRole('textbox', {
      name: 'Full prompt',
    });
    expect(fullPrompt).not.toBeDisabled();
    expect(fullPrompt).toHaveValue(
      [
        'SCENE: Professional boxing ring.',
        '',
        'SUBJECT: Athletic boxer in black gear.',
        '',
        'BACKGROUND: Blurred arena crowd.',
        '',
        'LIGHTING: Dramatic overhead spotlights.',
        '',
        'STYLE: Photorealistic sports photography.',
        '',
        'NEGATIVE: No text or watermarks.',
      ].join('\n'),
    );
    expect(screen.getByRole('heading', { name: 'Prompt' })).toBeTruthy();

    fireEvent.change(fullPrompt, {
      target: { value: 'SCENE: A quieter ring.\n\nSUBJECT: One boxer.' },
    });
    expect(fullPrompt).toHaveValue(
      'SCENE: A quieter ring.\n\nSUBJECT: One boxer.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Prompt' })).toHaveValue(
        'SCENE: A quieter ring.\n\nSUBJECT: One boxer.',
      );
    });
  });

  it('hides the prompt preview when the copy already fits two rows', async () => {
    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: {
            prompt: 'A short boxing ring.',
          },
          generationType: 'image',
          id: 'action-short',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock()}
      />,
    );

    await screen.findByRole('textbox', { name: 'Prompt' });
    expect(
      screen.queryByRole('button', { name: 'Read and edit the full prompt' }),
    ).toBeNull();
  });

  it('formats structured prompts with readable section breaks', async () => {
    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: {
            prompt:
              'SCENE: Professional boxing ring. SUBJECT: Athletic boxer in black gear. BACKGROUND: Blurred arena crowd. LIGHTING: Dramatic overhead spotlights. STYLE: Photorealistic sports photography. NEGATIVE: No text or watermarks.',
          },
          generationType: 'image',
          id: 'action-1',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue(
        [
          'SCENE: Professional boxing ring.',
          '',
          'SUBJECT: Athletic boxer in black gear.',
          '',
          'BACKGROUND: Blurred arena crowd.',
          '',
          'LIGHTING: Dramatic overhead spotlights.',
          '',
          'STYLE: Photorealistic sports photography.',
          '',
          'NEGATIVE: No text or watermarks.',
        ].join('\n'),
      );
    });
  });

  it('converts escaped newlines in generated prompts into real line breaks', async () => {
    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: {
            prompt:
              'SCENE: Professional boxing ring.\\n\\nSUBJECT: Athletic boxer in black gear.',
          },
          generationType: 'image',
          id: 'action-2',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue(
        'SCENE: Professional boxing ring.\n\nSUBJECT: Athletic boxer in black gear.',
      );
    });
  });

  it('passes Genfeed image models into the shared model selector', async () => {
    const imageModel = createModel({
      key: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA,
      label: 'Nano Banana',
    });
    const videoModel = createModel({
      category: ModelCategory.VIDEO,
      key: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
      label: 'Veo 3',
    });

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: {
            prompt: 'SCENE: Professional boxing ring.',
          },
          generationType: 'image',
          id: 'action-3',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock({
          models: [imageModel, videoModel],
        })}
      />,
    );

    await waitFor(() => {
      expect(capturedModelSelectorPopoverProps.models).toEqual([imageModel]);
    });

    expect(screen.getByTestId('model-selector-popover')).toHaveTextContent(
      'Auto · Best Quality',
    );
    expect(capturedModelSelectorPopoverProps.values).toEqual([
      '__auto_model__',
    ]);
    expect(capturedModelSelectorPopoverProps.prioritize).toBe(
      RouterPriority.QUALITY,
    );
    expect(capturedModelSelectorPopoverProps.selectionMode).toBe('single');
  });

  it('uses the outputs dropdown for multiple images, not multi-model checkboxes', async () => {
    const onUiAction = vi.fn().mockResolvedValue(undefined);

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: {
            aspectRatio: '9:16',
            prompt: 'Editorial portrait with restrained studio lighting.',
          },
          generationType: 'image',
          id: 'action-outputs',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock({
          models: [
            createModel({
              key: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA,
              label: 'Nano Banana',
            }),
          ],
        })}
        onUiAction={onUiAction}
      />,
    );

    await waitFor(() => {
      expect(capturedModelSelectorPopoverProps.selectionMode).toBe('single');
    });

    const outputsTrigger = await screen.findByRole('button', {
      name: /number of outputs/i,
    });
    expect(outputsTrigger).toHaveTextContent('1x');
    fireEvent.click(screen.getByRole('button', { name: '2x' }));
    expect(outputsTrigger).toHaveTextContent('2x');

    fireEvent.click(
      await screen.findByRole('button', { name: /generate image/i }),
    );

    await waitFor(() => {
      expect(onUiAction).toHaveBeenCalledWith(
        'confirm_generate_media',
        expect.objectContaining({
          outputs: 2,
          sourceActionId: 'action-outputs',
        }),
      );
    });
  });

  it('maps auto priority state into the shared selector label', async () => {
    const imageModel = createModel({
      key: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA,
      label: 'Nano Banana',
    });

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: {
            prompt: 'SCENE: Professional boxing ring.',
          },
          generationType: 'image',
          id: 'action-4',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock({ models: [imageModel] })}
      />,
    );

    await waitFor(() => {
      expect(capturedModelSelectorPopoverProps.onPrioritizeChange).toBeTypeOf(
        'function',
      );
    });

    capturedModelSelectorPopoverProps.onPrioritizeChange?.(
      RouterPriority.SPEED,
    );

    await waitFor(() => {
      expect(screen.getByTestId('model-selector-popover')).toHaveTextContent(
        'Auto · Fastest',
      );
    });
  });

  it('restores Auto · Lowest Cost after a remount from the preferred store', async () => {
    const imageModel = createModel({
      key: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA,
      label: 'Nano Banana',
    });
    const action = {
      generationParams: {
        model: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
        prompt: 'SCENE: Professional boxing ring.',
      },
      generationType: 'image' as const,
      id: 'action-priority-persist',
      title: 'Generate Image',
      type: 'generation_action_card' as const,
    };
    const apiService = createApiServiceMock({ models: [imageModel] });

    const first = renderGenerationActionCard(
      <GenerationActionCard action={action} apiService={apiService} />,
    );

    await waitFor(() => {
      expect(capturedModelSelectorPopoverProps.onPrioritizeChange).toBeTypeOf(
        'function',
      );
    });

    capturedModelSelectorPopoverProps.onPrioritizeChange?.(RouterPriority.COST);
    await waitFor(() => {
      expect(screen.getByTestId('model-selector-popover')).toHaveTextContent(
        'Auto · Lowest Cost',
      );
    });

    first.unmount();

    renderGenerationActionCard(
      <GenerationActionCard action={action} apiService={apiService} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('model-selector-popover')).toHaveTextContent(
        'Auto · Lowest Cost',
      );
    });
    expect(capturedModelSelectorPopoverProps.values).toEqual([
      AUTO_MODEL_OPTION_VALUE,
    ]);
    expect(capturedModelSelectorPopoverProps.prioritize).toBe(
      RouterPriority.COST,
    );
  });

  it('hydrates Auto priority from the preferred store even when the action pinned a model', async () => {
    writePreferredGenerationModel(AUTO_MODEL_OPTION_VALUE, {
      generationType: 'image',
      threadId: 'thread-1',
    });
    writePreferredGenerationPriority(RouterPriority.COST, {
      generationType: 'image',
      threadId: 'thread-1',
    });

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: {
            model: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
            prompt: 'SCENE: Professional boxing ring.',
          },
          generationType: 'image',
          id: 'action-priority-hydrate',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock({
          models: [
            createModel({
              key: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA,
              label: 'Nano Banana',
            }),
          ],
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('model-selector-popover')).toHaveTextContent(
        'Auto · Lowest Cost',
      );
    });
    expect(capturedModelSelectorPopoverProps.values).toEqual([
      AUTO_MODEL_OPTION_VALUE,
    ]);
  });

  it('restores a concrete generation model and 3x outputs after remount', async () => {
    const imageModel = createModel({
      key: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_DEV,
      label: 'Flux 2 Dev',
    });
    const action = {
      generationParams: {
        model: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
        prompt: 'SCENE: Professional boxing ring.',
      },
      generationType: 'image' as const,
      id: 'action-model-persist',
      title: 'Generate Image',
      type: 'generation_action_card' as const,
    };
    const apiService = createApiServiceMock({ models: [imageModel] });

    const first = renderGenerationActionCard(
      <GenerationActionCard action={action} apiService={apiService} />,
    );

    await waitFor(() => {
      expect(capturedModelSelectorPopoverProps.onChange).toBeTypeOf('function');
    });

    capturedModelSelectorPopoverProps.onChange?.('models', [
      MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_DEV,
    ]);
    fireEvent.click(await screen.findByRole('button', { name: '3x' }));

    await waitFor(() => {
      expect(capturedModelSelectorPopoverProps.values).toEqual([
        MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_DEV,
      ]);
    });
    expect(
      screen.getByRole('button', { name: /number of outputs/i }),
    ).toHaveTextContent('3x');

    first.unmount();

    renderGenerationActionCard(
      <GenerationActionCard action={action} apiService={apiService} />,
    );

    await waitFor(() => {
      expect(capturedModelSelectorPopoverProps.values).toEqual([
        MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_DEV,
      ]);
    });
    expect(
      screen.getByRole('button', { name: /number of outputs/i }),
    ).toHaveTextContent('3x');
  });

  it('hydrates a stored generation model over the action pin', async () => {
    writePreferredGenerationModel(
      MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_DEV,
      {
        generationType: 'image',
        threadId: 'thread-1',
      },
    );
    writePreferredGenerationOutputs(3, {
      generationType: 'image',
      threadId: 'thread-1',
    });

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: {
            model: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
            prompt: 'SCENE: Professional boxing ring.',
          },
          generationType: 'image',
          id: 'action-model-hydrate',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock({
          models: [
            createModel({
              key: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_DEV,
              label: 'Flux 2 Dev',
            }),
          ],
        })}
      />,
    );

    await waitFor(() => {
      expect(capturedModelSelectorPopoverProps.values).toEqual([
        MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_DEV,
      ]);
    });
    expect(
      screen.getByRole('button', { name: /number of outputs/i }),
    ).toHaveTextContent('3x');
  });

  it('allows leaving auto mode without forcing auto back on', async () => {
    const imageModel = createModel({
      key: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA,
      label: 'Nano Banana',
    });

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: {
            prompt: 'SCENE: Professional boxing ring.',
          },
          generationType: 'image',
          id: 'action-5',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock({ models: [imageModel] })}
      />,
    );

    await waitFor(() => {
      expect(capturedModelSelectorPopoverProps.values).toEqual([
        '__auto_model__',
      ]);
    });

    capturedModelSelectorPopoverProps.onChange?.('models', []);

    await waitFor(() => {
      expect(capturedModelSelectorPopoverProps.values).toEqual([]);
    });
  });

  it('keeps the generate form open while a run is in flight', async () => {
    const generateIngredient = vi.fn(() => new Promise(() => undefined));

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: {
            model: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
            prompt: 'SCENE: Professional boxing ring.',
          },
          generationType: 'image',
          id: 'action-keep-open',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock({
          generateIngredient,
          models: [
            createModel({
              key: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
              label: 'FLUX Schnell',
            }),
          ],
        })}
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: /generate image/i }),
    );

    expect(
      await screen.findByRole('textbox', { name: 'Prompt' }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Stop generation' }).length,
    ).toBeGreaterThan(0);
  });

  it('retries generation with current state and marks the active thread as locally busy', async () => {
    const createPrompt = vi.fn().mockResolvedValue({ id: 'prompt-1' });
    const generateIngredient = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          '500 - Request to https://api.replicate.com/v1/predictions failed with status 422 Unprocessable Entity: {"title":"Invalid version or not permitted","detail":"The specified version does not exist"}',
        ),
      )
      .mockResolvedValueOnce({
        id: 'image-1',
        url: 'https://cdn.test/image.png',
      });

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: {
            model: MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO,
            prompt: 'SCENE: Professional boxing ring.',
          },
          generationType: 'image',
          id: 'action-6',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock({
          createPrompt,
          generateIngredient,
          models: [
            createModel({
              key: MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO,
              label: 'Z-Image Turbo',
            }),
          ],
        })}
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: /generate image/i }),
    );

    expect(
      await screen.findByText(
        /selected model is misconfigured or unavailable/i,
      ),
    ).toBeInTheDocument();
    expect(storeState.setThreadUiBusy).toHaveBeenCalledWith('thread-1', true);
    expect(storeState.setThreadUiBusy).toHaveBeenCalledWith('thread-1', false);

    // Primary Generate control must stay available after failure. The card
    // owns the error — do not add a second Try Again under it.
    expect(
      screen.getByRole('button', { name: /generate image/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /try again/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /generate image/i }));

    await waitFor(() => {
      expect(generateIngredient).toHaveBeenCalledTimes(2);
    });

    expect(
      (await screen.findAllByRole('link', { name: 'Library' })).length,
    ).toBeGreaterThan(0);
  });

  it('keeps Generate clickable after failure and clears the composer error', async () => {
    const generateIngredient = vi
      .fn()
      .mockRejectedValueOnce(new Error('Request failed with status code 401'))
      .mockResolvedValueOnce({
        id: 'image-2',
        url: 'https://cdn.test/image-2.png',
      });

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: {
            model: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
            prompt: 'Broadcast newsroom crypto banner.',
          },
          generationType: 'image',
          id: 'action-generate-after-error',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock({
          generateIngredient,
          models: [
            createModel({
              key: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
              label: 'FLUX Schnell',
            }),
          ],
        })}
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: /generate image/i }),
    );

    expect(
      await screen.findByText(/provider authentication failed/i),
    ).toBeInTheDocument();
    expect(storeState.setError).toHaveBeenCalledWith(null);
    storeState.setError.mockClear();

    const generateAgain = screen.getByRole('button', {
      name: /generate image/i,
    });
    fireEvent.click(generateAgain);

    await waitFor(() => {
      expect(generateIngredient).toHaveBeenCalledTimes(2);
    });
    expect(storeState.setError).toHaveBeenCalledTimes(1);
    expect(storeState.setError).toHaveBeenCalledWith(null);
    expect(
      (await screen.findAllByRole('link', { name: 'Library' })).length,
    ).toBeGreaterThan(0);
  });

  it('keeps Generate clickable when the composer UI action reports failure', async () => {
    storeState.error =
      'Failed to respond to UI action: 401 - The model provider rejected the credentials for this request.';
    const onUiAction = vi.fn().mockResolvedValue(false);

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: {
            prompt:
              'Cinematic vertical portrait of Elon Musk heading into space.',
          },
          generationType: 'image',
          id: 'action-ui-action-401',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock()}
        onUiAction={onUiAction}
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: /generate image/i }),
    );

    expect(
      await screen.findByText(/provider authentication failed/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Done$/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /generate image/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /try again/i }),
    ).not.toBeInTheDocument();
    expect(storeState.setError).toHaveBeenCalledWith(null);

    copyToClipboard.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Copy error' }));
    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalled();
    });
    expect(String(copyToClipboard.mock.calls[0]?.[0])).toContain(
      '## Agent run failure',
    );
    expect(String(copyToClipboard.mock.calls[0]?.[0])).toContain(
      'Failed to respond to UI action: 401',
    );
  });

  it('lets the operator collapse a failed generation card by hand', async () => {
    storeState.error =
      'Failed to respond to UI action: 401 - The model provider rejected the credentials for this request.';
    const onUiAction = vi.fn().mockResolvedValue(false);

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: {
            prompt: 'Cinematic launch-day moment at a coastal spaceport.',
          },
          generationType: 'image',
          id: 'action-collapse-after-error',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock()}
        onUiAction={onUiAction}
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: /generate image/i }),
    );
    expect(
      await screen.findByText(/provider authentication failed/i),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Collapse generation card' }),
    );

    expect(
      screen.queryByText(/provider authentication failed/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Prompt' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /generate image/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Expand generation card' }),
    ).toBeInTheDocument();
  });

  it('routes composer generation through the persisted thread UI action', async () => {
    const onUiAction = vi.fn().mockResolvedValue(undefined);

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: {
            aspectRatio: '9:16',
            prompt: 'Editorial portrait with restrained studio lighting.',
          },
          generationType: 'image',
          id: 'action-7',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock()}
        onUiAction={onUiAction}
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: /generate image/i }),
    );

    await waitFor(() => {
      expect(onUiAction).toHaveBeenCalledWith(
        'confirm_generate_media',
        expect.objectContaining({
          aspectRatio: '9:16',
          generationType: 'image',
          prompt: 'Editorial portrait with restrained studio lighting.',
          sourceActionId: 'action-7',
        }),
      );
    });
  });

  it('aborts the in-flight generate request when Stop is pressed', async () => {
    let rejectGenerate: ((reason?: unknown) => void) | undefined;
    const generateIngredient = vi.fn(
      (_type: unknown, _body: unknown, signal?: AbortSignal) =>
        new Promise((_resolve, reject) => {
          rejectGenerate = reject;
          signal?.addEventListener('abort', () => {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: {
            prompt: 'A cinematic sunrise over the ocean.',
          },
          generationType: 'image',
          id: 'action-stop',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock({ generateIngredient })}
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: /generate image/i }),
    );

    fireEvent.click(
      (await screen.findAllByRole('button', { name: /stop generation/i }))[0],
    );

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /stop generation/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /generate image/i }),
      ).toBeInTheDocument();
    });
    expect(rejectGenerate).toBeDefined();
  });

  it('shows an allowlisted generate model and hides disabled catalog rows', async () => {
    const flux = createModel({
      key: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
      label: 'FLUX Schnell',
    });
    const kling = createModel({
      category: ModelCategory.VIDEO,
      key: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_6,
      label: 'Kling 2.6',
    });
    const nanoBanana = createModel({
      key: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA,
      label: 'Nano Banana',
    });
    brandState.organizationId = 'org_demo';
    brandState.settings = { enabledModelIds: [nanoBanana.key] };

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: {
            prompt: 'Editorial portrait with restrained studio lighting.',
          },
          generationType: 'image',
          id: 'action-allowlist-visible',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock({
          models: [flux, kling, nanoBanana],
        })}
      />,
    );

    await waitFor(() => {
      expect(capturedModelSelectorPopoverProps.models).toEqual([nanoBanana]);
    });
    expect(capturedModelSelectorPopoverProps.autoLabel).toMatch(/Auto/);
  });

  it('does not offer Auto, Flux, or Kling when the org allowlist is empty', async () => {
    const onUiAction = vi.fn().mockResolvedValue(undefined);
    brandState.organizationId = 'org_demo';
    brandState.settings = { enabledModelIds: [] };

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: {
            prompt: 'Editorial portrait with restrained studio lighting.',
          },
          generationType: 'image',
          id: 'action-allowlist-empty',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock({
          models: [
            createModel({
              key: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
              label: 'FLUX Schnell',
            }),
            createModel({
              category: ModelCategory.VIDEO,
              key: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_6,
              label: 'Kling 2.6',
            }),
          ],
        })}
        onUiAction={onUiAction}
      />,
    );

    expect(
      await screen.findByRole('button', { name: /no models enabled/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('model-selector-popover'),
    ).not.toBeInTheDocument();
    expect(capturedModelSelectorPopoverProps.models).toBeUndefined();
    expect(capturedModelSelectorPopoverProps.autoLabel).toBeUndefined();

    const generate = screen.getByRole('button', { name: /generate image/i });
    expect(generate).toBeDisabled();
    fireEvent.click(generate);
    expect(onUiAction).not.toHaveBeenCalled();
  });

  it('generates a short video pilot first and waits for acceptance before the full run', async () => {
    const generateIngredient = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'video-pilot-1',
        url: 'https://cdn.test/pilot.mp4',
      })
      .mockResolvedValueOnce({
        id: 'video-full-1',
        url: 'https://cdn.test/full.mp4',
      });

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: {
            duration: 10,
            prompt: 'A presenter walking through neon rain.',
          },
          generationType: 'video',
          id: 'action-video-pilot',
          title: 'Generate Video',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock({
          generateIngredient,
          models: [
            createModel({
              category: ModelCategory.VIDEO,
              durations: [5, 10],
              key: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_6,
              label: 'Kling 2.6',
            }),
          ],
        })}
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: /generate video/i }),
    );

    await waitFor(() => {
      expect(generateIngredient).toHaveBeenCalledWith(
        'video',
        expect.objectContaining({ duration: 5 }),
        expect.any(AbortSignal),
      );
    });

    expect(
      await screen.findByText(
        'Review this 5s pilot before the full-length run',
      ),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Accept the pilot and generate the full-length video',
      }),
    );

    await waitFor(() => {
      expect(generateIngredient).toHaveBeenCalledTimes(2);
      expect(generateIngredient).toHaveBeenLastCalledWith(
        'video',
        expect.objectContaining({ duration: 10 }),
        expect.any(AbortSignal),
      );
    });
  });

  it('halts after three rejected video pilots and does not call the provider again', async () => {
    const generateIngredient = vi.fn().mockResolvedValue({
      id: 'video-pilot-1',
      url: 'https://cdn.test/pilot.mp4',
    });

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: {
            duration: 10,
            prompt: 'A presenter walking through neon rain.',
          },
          generationType: 'video',
          id: 'action-video-ceiling',
          title: 'Generate Video',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock({
          generateIngredient,
          models: [
            createModel({
              category: ModelCategory.VIDEO,
              durations: [5, 10],
              key: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_6,
              label: 'Kling 2.6',
            }),
          ],
        })}
      />,
    );

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      fireEvent.click(
        await screen.findByRole('button', { name: /generate video/i }),
      );
      fireEvent.click(
        await screen.findByRole('button', { name: 'Reject this pilot' }),
      );
    }

    expect(
      await screen.findByText(
        'Stopped after 3 rejected paid candidates. No further video generation will run for this clip.',
      ),
    ).toBeInTheDocument();
    expect(generateIngredient).toHaveBeenCalledTimes(3);
    expect(
      screen.queryByRole('button', { name: /generate video/i }),
    ).not.toBeInTheDocument();
  });

  it('shows the resolved model and credit estimate for an image review', async () => {
    const estimateGenerationCredits = vi.fn().mockResolvedValue({
      credits: 3,
      isAvailable: true,
      modelKey: 'provider/nano-banana',
    });

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: { prompt: 'A portrait at golden hour.' },
          generationType: 'image',
          id: 'action-estimate-image',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock({ estimateGenerationCredits })}
      />,
    );

    await waitFor(
      () => {
        expect(estimateGenerationCredits).toHaveBeenCalledWith(
          expect.objectContaining({
            category: 'image',
            prompt: 'A portrait at golden hour.',
          }),
          expect.any(AbortSignal),
        );
      },
      { timeout: 2000 },
    );

    expect(
      await screen.findByText('Model: provider/nano-banana', undefined, {
        timeout: 2000,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('~3 credits')).toBeInTheDocument();
  });

  it('shows the resolved model and credit estimate for a video review', async () => {
    const estimateGenerationCredits = vi.fn().mockResolvedValue({
      credits: 12,
      isAvailable: true,
      modelKey: 'provider/kling',
    });

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: {
            duration: 10,
            prompt: 'A presenter walking through neon rain.',
          },
          generationType: 'video',
          id: 'action-estimate-video',
          title: 'Generate Video',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock({
          estimateGenerationCredits,
          models: [
            createModel({
              category: ModelCategory.VIDEO,
              durations: [5, 10],
              key: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_6,
              label: 'Kling 2.6',
            }),
          ],
        })}
      />,
    );

    expect(
      await screen.findByText('Model: provider/kling', undefined, {
        timeout: 2000,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('~12 credits')).toBeInTheDocument();
  });

  it('shows "estimate unavailable" without blocking Generate', async () => {
    const estimateGenerationCredits = vi.fn().mockResolvedValue({
      credits: null,
      isAvailable: false,
      modelKey: null,
    });

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: { prompt: 'A portrait at golden hour.' },
          generationType: 'image',
          id: 'action-estimate-unavailable',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock({ estimateGenerationCredits })}
      />,
    );

    expect(
      await screen.findByText('Estimate unavailable', undefined, {
        timeout: 2000,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /generate image/i }),
    ).toBeEnabled();
  });

  it('treats a failed estimate request the same as isAvailable:false', async () => {
    const estimateGenerationCredits = vi
      .fn()
      .mockRejectedValue(new Error('network error'));

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: { prompt: 'A portrait at golden hour.' },
          generationType: 'image',
          id: 'action-estimate-error',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock({ estimateGenerationCredits })}
      />,
    );

    expect(
      await screen.findByText('Estimate unavailable', undefined, {
        timeout: 2000,
      }),
    ).toBeInTheDocument();
  });

  it('declines a review without calling the server, ending it without charge', async () => {
    const generateIngredient = vi.fn();
    const onUiAction = vi.fn();

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: { prompt: 'A portrait at golden hour.' },
          generationType: 'image',
          id: 'action-decline',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock({ generateIngredient })}
        onUiAction={onUiAction}
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'Decline this generation' }),
    );

    expect(
      await screen.findByText('Declined — no credits were charged.'),
    ).toBeInTheDocument();
    expect(generateIngredient).not.toHaveBeenCalled();
    expect(onUiAction).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: /generate image/i }),
    ).not.toBeInTheDocument();
  });

  it('does not render an Open in Studio control unless a handler is passed', async () => {
    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: { prompt: 'A portrait at golden hour.' },
          generationType: 'image',
          id: 'action-no-studio-slot',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock()}
      />,
    );

    await screen.findByRole('textbox', { name: 'Prompt' });
    expect(
      screen.queryByRole('button', { name: /open this generation in studio/i }),
    ).not.toBeInTheDocument();
  });

  it('renders Open in Studio only when the #4670 extension slot is wired', async () => {
    const onOpenInStudio = vi.fn();
    const createStudioHandoff = vi.fn().mockResolvedValue({ id: 'handoff-1' });
    const estimateGenerationCredits = vi.fn().mockResolvedValue({
      credits: 3,
      isAvailable: true,
      modelKey: 'provider/nano-banana',
    });

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: { prompt: 'A portrait at golden hour.' },
          generationType: 'image',
          id: 'action-studio-slot',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock({
          createStudioHandoff,
          estimateGenerationCredits,
        })}
        onOpenInStudio={onOpenInStudio}
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open this generation in Studio',
      }),
    );

    await waitFor(() => {
      expect(createStudioHandoff).toHaveBeenCalledWith(
        expect.objectContaining({
          modelKey: 'provider/nano-banana',
          prompt: 'A portrait at golden hour.',
          type: 'image',
        }),
      );
    });
    expect(onOpenInStudio).toHaveBeenCalledTimes(1);
    expect(onOpenInStudio).toHaveBeenCalledWith(
      expect.stringContaining('handoff=handoff-1'),
    );
  });

  it('opens Studio at the brand-scoped path from a route with no brand segment (#4716 P0 — the org-level Agent workspace 404ed)', async () => {
    // `/:orgSlug/~/agent` (the canonical Agent workspace route) carries no
    // brand segment — `useOrgUrl().href` falls through to the org scope
    // there and would build `/org-1/~/studio/generate?...`, a route that
    // does not exist (Studio generate only lives under a brand slug).
    // `activeHref` falls back to the context-selected brand instead.
    orgUrlParams.brandSlug = '';
    brandState.selectedBrand = { slug: 'brand-1' };
    const onOpenInStudio = vi.fn();
    const createStudioHandoff = vi
      .fn()
      .mockResolvedValue({ id: 'handoff-no-brand-route' });
    const estimateGenerationCredits = vi.fn().mockResolvedValue({
      credits: 3,
      isAvailable: true,
      modelKey: 'provider/nano-banana',
    });

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: { prompt: 'A portrait at golden hour.' },
          generationType: 'image',
          id: 'action-studio-slot-no-brand-route',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock({
          createStudioHandoff,
          estimateGenerationCredits,
        })}
        onOpenInStudio={onOpenInStudio}
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open this generation in Studio',
      }),
    );

    await waitFor(() => expect(onOpenInStudio).toHaveBeenCalledTimes(1));
    const [studioUrl] = onOpenInStudio.mock.calls[0] as [string];
    expect(studioUrl).toBe(
      '/test-org/brand-1/studio/generate?handoff=handoff-no-brand-route',
    );
    expect(studioUrl).not.toContain('/~/');
  });

  it('surfaces a composer error instead of navigating when the handoff cannot be created', async () => {
    const onOpenInStudio = vi.fn();
    const createStudioHandoff = vi
      .fn()
      .mockRejectedValue(new Error('Handoff storage unavailable'));
    const estimateGenerationCredits = vi.fn().mockResolvedValue({
      credits: 3,
      isAvailable: true,
      modelKey: 'provider/nano-banana',
    });

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: { prompt: 'A portrait at golden hour.' },
          generationType: 'image',
          id: 'action-studio-slot-failure',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock({
          createStudioHandoff,
          estimateGenerationCredits,
        })}
        onOpenInStudio={onOpenInStudio}
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open this generation in Studio',
      }),
    );

    // The composer error is the shared thread-level store (`storeState.setError`
    // here, `useAgentChatStore` for real) — this file's mock doesn't feed that
    // back into a rendered banner, so assert the call the real store would
    // render from, same as the other composer-error tests in this file.
    await waitFor(() => {
      expect(storeState.setError).toHaveBeenCalledWith(
        'Failed to open in Studio. Try again.',
      );
    });
    expect(onOpenInStudio).not.toHaveBeenCalled();
  });

  it('renders Open in Studio on the completed result once generation finishes', async () => {
    const onOpenInStudio = vi.fn();
    const createStudioHandoff = vi
      .fn()
      .mockResolvedValue({ id: 'handoff-completed-1' });
    const generateIngredient = vi.fn().mockResolvedValue({
      id: 'image-completed-1',
      url: 'https://cdn.test/image-completed.png',
    });

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: {
            model: MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO,
            prompt: 'A neon skyline at dusk.',
          },
          generationType: 'image',
          id: 'action-studio-slot-done',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock({
          createStudioHandoff,
          generateIngredient,
          models: [
            createModel({
              key: MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO,
              label: 'Z-Image Turbo',
            }),
          ],
        })}
        onOpenInStudio={onOpenInStudio}
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: /generate image/i }),
    );

    await waitFor(() => {
      expect(generateIngredient).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Open in Studio' }),
    );

    // The action pins an explicit model, so the handoff carries that pin
    // directly — the credit-estimate's resolved model only matters in Auto
    // mode (see the review-card test above).
    await waitFor(() => {
      expect(createStudioHandoff).toHaveBeenCalledWith(
        expect.objectContaining({
          modelKey: MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO,
          prompt: 'A neon skyline at dusk.',
          type: 'image',
        }),
      );
    });
    expect(onOpenInStudio).toHaveBeenCalledTimes(1);
    expect(onOpenInStudio).toHaveBeenCalledWith(
      expect.stringContaining('handoff=handoff-completed-1'),
    );
  });

  it('does not render Open in Studio on the completed result without a handler', async () => {
    const generateIngredient = vi.fn().mockResolvedValue({
      id: 'image-completed-2',
      url: 'https://cdn.test/image-completed-2.png',
    });

    renderGenerationActionCard(
      <GenerationActionCard
        action={{
          generationParams: {
            model: MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO,
            prompt: 'A neon skyline at dusk.',
          },
          generationType: 'image',
          id: 'action-studio-slot-done-no-handler',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={createApiServiceMock({
          generateIngredient,
          models: [
            createModel({
              key: MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO,
              label: 'Z-Image Turbo',
            }),
          ],
        })}
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: /generate image/i }),
    );

    await waitFor(() => {
      expect(generateIngredient).toHaveBeenCalledTimes(1);
    });
    expect(
      await screen.findAllByRole('link', { name: 'Library' }),
    ).not.toHaveLength(0);
    expect(
      screen.queryByRole('button', { name: 'Open in Studio' }),
    ).not.toBeInTheDocument();
  });
});
