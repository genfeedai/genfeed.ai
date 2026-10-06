import type {
  CrunInputControls,
  IModel,
} from '@genfeedai/contracts/interfaces';
import type { DesktopRuntimeSnapshot } from '@genfeedai/services/core/desktop-runtime.service';
import { getDefaultStudioGenerateSettings } from '@pages/studio/generate/utils/studio-generate-settings';

const runtimeMocks = vi.hoisted(() => ({
  snapshot: { status: 'web', context: null } as DesktopRuntimeSnapshot,
}));
vi.mock(
  '@genfeedai/hooks/ui/use-desktop-runtime-context/use-desktop-runtime-context',
  () => ({ useDesktopRuntimeContext: () => runtimeMocks.snapshot }),
);
vi.mock(
  '@genfeedai/services/core/desktop-runtime.service',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@genfeedai/services/core/desktop-runtime.service')
      >();
    return {
      ...actual,
      desktopRuntimeService: {
        getCurrentSnapshot: () => runtimeMocks.snapshot,
      },
      canSubmitStudioGeneration: (snapshot = runtimeMocks.snapshot) =>
        actual.canSubmitStudioGeneration(snapshot),
    };
  },
);

import {
  ModelCategory,
  ModelLifecycle,
  ModelProvider,
  RouterPriority,
} from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { getDefaultVideoResolution } from '@genfeedai/helpers/media/video-resolution/video-resolution.helper';
import StudioGenerateComposer from '@pages/studio/generate/components/StudioGenerateComposer';
import { getDefaultGenerationSetupValues } from '@pages/studio/generate/utils/studio-generation-setup-bridge';
import { fireEvent, render, screen } from '@testing-library/react';
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const walletMocks = vi.hoisted(() => ({
  balance: 120 as number | null,
  isLoaded: true,
  isLoading: false,
  showCredits: true,
}));
vi.mock('@genfeedai/config/license', () => ({
  shouldShowCreditsNav: () => walletMocks.showCredits,
}));
vi.mock(
  '@genfeedai/hooks/data/billing/use-topbar-balances/use-topbar-balances',
  () => ({
    useTopbarBalances: () => ({
      genfeedBalance: walletMocks.balance,
      isLoaded: walletMocks.isLoaded,
      isLoading: walletMocks.isLoading,
    }),
  }),
);
vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgHref: (path: string) => `/test-org${path}` }),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@ui/dropdowns/model-selector/useModelFavorites', () => ({
  useModelFavorites: () => ({
    favoriteModelKeys: new Set<string>(),
    onFavoriteToggle: vi.fn(),
  }),
}));

const generationSetupPopoverMocks = vi.hoisted(() => ({
  props: {} as Record<string, unknown>,
}));

vi.mock('@ui/dropdowns/generation-setup/GenerationSetupPopover', () => ({
  default: (props: Record<string, unknown>) => {
    generationSetupPopoverMocks.props = props;
    return (
      <button type="button" aria-label="Setup">
        {props.triggerLabel as string}
      </button>
    );
  },
}));

const identityFieldsMocks = vi.hoisted(() => ({
  props: {} as Record<string, unknown>,
}));

vi.mock('@pages/studio/generate/components/StudioIdentityFields', () => ({
  default: (props: Record<string, unknown>) => {
    identityFieldsMocks.props = props;
    return <button type="button">Identity</button>;
  },
}));

const studioLooksMocks = vi.hoisted(() => ({
  deleteLook: vi.fn(async () => true),
  isLoading: false,
  looks: [] as unknown[],
  presetToGenerationSetupValues: vi.fn(() => ({ style: 'preset-style' })),
  saveLook: vi.fn(async () => true),
}));

vi.mock('@pages/studio/generate/hooks/useStudioLooks', () => ({
  presetToGenerationSetupValues: studioLooksMocks.presetToGenerationSetupValues,
  useStudioLooks: () => ({
    deleteLook: studioLooksMocks.deleteLook,
    deletingId: null,
    error: null,
    isLoading: studioLooksMocks.isLoading,
    isSaving: false,
    looks: studioLooksMocks.looks,
    saveLook: studioLooksMocks.saveLook,
  }),
}));

const estimateMocks = vi.hoisted(() => ({
  resolve: vi.fn(),
}));

// The estimate is the server admission quote; the composer only requests it.
vi.mock('@pages/studio/generate/hooks/useStudioGenerationEstimate', () => ({
  useStudioGenerationEstimate: (request: unknown) =>
    (request ? estimateMocks.resolve(request) : undefined) ?? {
      credits: null,
      status: 'loading',
    },
}));

vi.mock(
  '@pages/studio/generate/hooks/useStudioGenerationSetupLookOptions',
  () => ({ useStudioGenerationSetupLookOptions: () => ({}) }),
);

const storeMocks = vi.hoisted(() => ({
  applyPreset: vi.fn(),
  applyRecommendation: vi.fn(),
  clearPreset: vi.fn(),
  reasonsByScope: {} as Record<string, unknown>,
  resetField: vi.fn(),
  setField: vi.fn(),
  setupByScope: {} as Record<string, unknown>,
}));

vi.mock('@ui/dropdowns/generation-setup/generation-setup.store', () => ({
  applyGenerationSetupPreset: storeMocks.applyPreset,
  applyGenerationSetupRecommendation: storeMocks.applyRecommendation,
  buildStudioGenerationSetupScope: (type: string) => `studio:${type}`,
  clearGenerationSetupPreset: storeMocks.clearPreset,
  resetGenerationSetupField: storeMocks.resetField,
  setGenerationSetupField: storeMocks.setField,
  useGenerationSetupStore: (
    selector: (state: Record<string, unknown>) => unknown,
  ) =>
    selector({
      reasonsByScope: storeMocks.reasonsByScope,
      setupByScope: storeMocks.setupByScope,
    }),
}));

const recommendMocks = vi.hoisted(() => ({
  recommend: vi.fn(() => ({ reasons: {}, values: {} })),
}));

vi.mock('@ui/dropdowns/generation-setup/generation-setup.recommend', () => ({
  recommendGenerationSetup: recommendMocks.recommend,
}));

const promptEditorProps: { extraExtensions?: unknown; onSubmit?: () => void } =
  {};

vi.mock('@ui/prompt-editor/PromptEditor', () => ({
  default: ({
    extraExtensions,
    onSubmit,
    testId,
    value,
  }: {
    extraExtensions?: unknown;
    onSubmit?: () => void;
    testId?: string;
    value?: string;
  }) => {
    promptEditorProps.extraExtensions = extraExtensions;
    promptEditorProps.onSubmit = onSubmit;
    return (
      <div aria-label="Prompt" data-testid={testId} role="textbox" tabIndex={0}>
        {value}
      </div>
    );
  },
}));

const settings = {
  aspectRatio: '1:1',
  blacklist: [],
  brandingMode: 'brand' as const,
  isAudioEnabled: false,
  modelKey: 'auto',
  outputs: 1,
  prioritize: RouterPriority.BALANCED,
  resolution: '1K',
  tags: [],
};

const baseProps = {
  attachedAssets: [],
  isGenerating: false,
  isListening: false,
  isLoadingModels: false,
  isTranscribing: false,
  isUploading: false,
  models: [],
  onAddFiles: vi.fn(),
  onOpenLibrary: vi.fn(),
  onPromptChange: vi.fn(),
  onRemoveAttachedAsset: vi.fn(),
  onResetSettings: vi.fn(),
  onSettingsChange: vi.fn(),
  onStartListening: vi.fn(),
  onStopListening: vi.fn(),
  onSubmit: vi.fn(),
  onTypeChange: vi.fn(),
  shouldShowVoiceInput: false,
};

describe('StudioGenerateComposer', () => {
  beforeEach(() => {
    runtimeMocks.snapshot = { status: 'web', context: null };
    storeMocks.setupByScope = {};
    storeMocks.reasonsByScope = {};
    Object.assign(walletMocks, {
      balance: 120,
      isLoaded: true,
      isLoading: false,
      showCredits: true,
    });
    vi.clearAllMocks();
  });

  it('shows the selected settings in the picker and keeps library access in the context menu', () => {
    render(
      <StudioGenerateComposer
        {...baseProps}
        attachedAssets={[
          {
            id: 'reference',
            name: 'Apple reference',
            kind: 'image',
            role: 'reference',
            source: 'library',
          },
        ]}
        models={[{ key: 'banana', label: 'Nano Banana 2 Lite' } as IModel]}
        prompt="A green apple"
        settings={{ ...settings, modelKey: 'banana' }}
        type="image"
      />,
    );
    expect(screen.getByRole('button', { name: 'Setup' })).toHaveTextContent(
      'Nano Banana 2 Lite · 1:1 · 1K · 1 output',
    );
    expect(
      screen.queryByRole('button', { name: /browse library/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add context' }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Apple reference' }),
    );
    expect(baseProps.onRemoveAttachedAsset).toHaveBeenCalledWith('reference');
  });

  it('keeps an empty composer compact with setup and submission controls, then expands while typing', () => {
    const view = render(
      <StudioGenerateComposer
        {...baseProps}
        prompt=""
        settings={settings}
        type="image"
      />,
    );
    const shell = screen.getByTestId('studio-generate-composer-shell');
    expect(shell).toHaveAttribute('data-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Setup' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
    const summary = screen.getByTestId('studio-generation-summary');
    expect(summary).toBeVisible();
    expect(summary.parentElement).toContainElement(
      screen.getByRole('button', { name: 'Generate' }),
    );
    expect(
      screen.getByRole('link', { name: '120 available' }),
    ).not.toHaveAttribute('tabindex');

    const editor = screen.getByRole('textbox', { name: 'Prompt' });
    editor.focus();
    view.rerender(
      <StudioGenerateComposer
        {...baseProps}
        prompt="A product photo"
        settings={settings}
        type="image"
      />,
    );
    expect(shell).toHaveAttribute('data-expanded', 'true');
    expect(screen.getByTestId('studio-generation-summary')).toBeVisible();
    expect(screen.getByTestId('studio-generation-summary')).toBe(summary);
    expect(summary.parentElement).toContainElement(
      screen.getByRole('button', { name: 'Generate' }),
    );
    expect(
      screen.getByRole('link', { name: '120 available' }),
    ).not.toHaveAttribute('tabindex');
    expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled();
    expect(screen.getByRole('textbox', { name: 'Prompt' })).toBe(editor);
    expect(editor).toHaveFocus();

    view.rerender(
      <StudioGenerateComposer
        {...baseProps}
        prompt=""
        settings={settings}
        type="image"
      />,
    );
    expect(shell).toHaveAttribute('data-expanded', 'false');
    expect(editor).toHaveFocus();
  });

  it.each(['loading', 'switching', 'unavailable'] as const)(
    'guards button and keyboard while desktop runtime is %s',
    (status) => {
      runtimeMocks.snapshot = { status, context: null };
      render(
        <StudioGenerateComposer
          {...baseProps}
          prompt="A photo"
          settings={settings}
          type="image"
        />,
      );
      expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
      promptEditorProps.onSubmit?.();
      expect(baseProps.onSubmit).not.toHaveBeenCalled();
    },
  );
  it('rejects a keyboard callback captured before the runtime starts switching', () => {
    render(
      <StudioGenerateComposer
        {...baseProps}
        prompt="A photo"
        settings={settings}
        type="image"
      />,
    );
    const submit = promptEditorProps.onSubmit;
    runtimeMocks.snapshot = { status: 'switching', context: null };
    submit?.();
    expect(baseProps.onSubmit).not.toHaveBeenCalled();
  });

  it('applies studio extraExtensions to the prompt editor', () => {
    const extraExtensions = [{ name: 'characterMention' }];
    render(
      <StudioGenerateComposer
        {...baseProps}
        extraExtensions={extraExtensions as never}
        prompt="A product photo"
        settings={settings}
        type="image"
      />,
    );

    expect(promptEditorProps.extraExtensions).toBe(extraExtensions);
  });

  it('renders the unified GenerationSetupPopover', () => {
    const onTypeChange = vi.fn();

    render(
      <StudioGenerateComposer
        {...baseProps}
        onTypeChange={onTypeChange}
        prompt="A product photo"
        settings={settings}
        type="image"
      />,
    );

    expect(screen.getByRole('button', { name: 'Setup' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Generation settings' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Settings' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Identity' }),
    ).not.toBeInTheDocument();

    expect(generationSetupPopoverMocks.props).toEqual(
      expect.objectContaining({
        scopeKey: 'studio:image',
        typeOptions: [
          { label: 'Image', value: 'image' },
          { label: 'Edit image', value: 'image-edit' },
          { label: 'Video', value: 'video' },
          { label: 'Music', value: 'music' },
          { label: 'Avatar', value: 'avatar' },
          { label: 'Voice', value: 'voice' },
        ],
      }),
    );

    // The shared popover emits GenerationSetupType. Studio forwards only its own
    // registry, so an agent-only `text` pick never reaches the Studio handler.
    const emitTypeChange = generationSetupPopoverMocks.props.onTypeChange as (
      type: string,
    ) => void;
    emitTypeChange('video');
    emitTypeChange('text');
    expect(onTypeChange).toHaveBeenCalledOnce();
    expect(onTypeChange).toHaveBeenCalledWith('video');
    expect(
      (
        generationSetupPopoverMocks.props.capabilities as {
          hasIdentity: boolean;
        }
      ).hasIdentity,
    ).toBe(false);
  });

  it('shows the Identity chip only for identity-capable types', () => {
    render(
      <StudioGenerateComposer
        {...baseProps}
        prompt="Say hello"
        settings={{ ...settings, voiceId: 'voice-1' }}
        type="avatar"
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Identity' }),
    ).toBeInTheDocument();
    expect(identityFieldsMocks.props).toEqual(
      expect.objectContaining({
        onChange: baseProps.onSettingsChange,
        type: 'avatar',
      }),
    );
  });

  it('runs the recommendation engine on mount and re-applies it through the store', () => {
    render(
      <StudioGenerateComposer
        {...baseProps}
        prompt="A product photo"
        settings={settings}
        type="image"
      />,
    );

    expect(recommendMocks.recommend).toHaveBeenCalledWith(
      expect.objectContaining({
        lockedType: 'image',
        prompt: 'A product photo',
        type: 'image',
      }),
    );
    expect(storeMocks.applyRecommendation).toHaveBeenCalledWith(
      'studio:image',
      { reasons: {}, values: {} },
      getDefaultGenerationSetupValues('image'),
    );
  });

  it('wires field, preset, and reset callbacks from the popover to the shared store', () => {
    render(
      <StudioGenerateComposer
        {...baseProps}
        prompt="A product photo"
        settings={settings}
        type="image"
      />,
    );

    const defaults = getDefaultGenerationSetupValues('image');
    const props = generationSetupPopoverMocks.props as {
      onApplyPreset: (preset: { id: string }) => void;
      onClearPreset: () => void;
      onDeletePreset: (id: string) => void;
      onResetAll: () => void;
      onResetField: (key: string) => void;
      onSavePreset: (label: string) => void;
      onSetField: (key: string, value: unknown) => void;
    };

    props.onSetField('style', 'cinematic');
    expect(storeMocks.setField).toHaveBeenCalledWith(
      'studio:image',
      'style',
      'cinematic',
      defaults,
    );

    props.onResetField('style');
    expect(storeMocks.resetField).toHaveBeenCalledWith(
      'studio:image',
      'style',
      defaults,
    );

    props.onClearPreset();
    expect(storeMocks.clearPreset).toHaveBeenCalledWith('studio:image');

    props.onResetAll();
    expect(baseProps.onResetSettings).toHaveBeenCalledOnce();

    props.onApplyPreset({ id: 'preset-1' });
    expect(studioLooksMocks.presetToGenerationSetupValues).toHaveBeenCalledWith(
      {
        id: 'preset-1',
      },
    );
    expect(storeMocks.applyPreset).toHaveBeenCalledWith(
      'studio:image',
      'preset-1',
      { style: 'preset-style' },
      defaults,
    );

    props.onSavePreset('My Look');
    expect(studioLooksMocks.saveLook).toHaveBeenCalledWith('My Look', defaults);

    props.onDeletePreset('preset-1');
    expect(studioLooksMocks.deleteLook).toHaveBeenCalledWith('preset-1');
  });

  it('reconciles external music settings without mounting Output, idempotently', () => {
    const onSettingsChange = vi.fn();
    const musicSettings = {
      ...settings,
      modelKey: MODEL_KEYS.REPLICATE_META_MUSICGEN,
      duration: 90,
      instrumental: false,
      lyrics: 'stale verse',
    };
    const { rerender } = render(
      <StudioGenerateComposer
        {...baseProps}
        onSettingsChange={onSettingsChange}
        prompt="music"
        settings={musicSettings}
        type="music"
      />,
    );
    expect(onSettingsChange).toHaveBeenCalledWith({
      duration: 30,
      instrumental: true,
      lyrics: undefined,
    });
    onSettingsChange.mockClear();
    rerender(
      <StudioGenerateComposer
        {...baseProps}
        onSettingsChange={onSettingsChange}
        prompt="music"
        settings={{
          ...musicSettings,
          duration: 30,
          instrumental: true,
          lyrics: undefined,
        }}
        type="music"
      />,
    );
    expect(onSettingsChange).not.toHaveBeenCalled();
  });

  it('resets the video resolution to the new model default when the model changes', () => {
    render(
      <StudioGenerateComposer
        {...baseProps}
        prompt="A product reveal"
        settings={settings}
        type="video"
      />,
    );

    const defaults = getDefaultGenerationSetupValues('video');
    const props = generationSetupPopoverMocks.props as {
      onSetField: (key: string, value: unknown) => void;
    };

    props.onSetField('modelKey', MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5);

    expect(storeMocks.setField).toHaveBeenNthCalledWith(
      1,
      'studio:video',
      'modelKey',
      MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
      defaults,
    );
    expect(storeMocks.setField).toHaveBeenNthCalledWith(
      2,
      'studio:video',
      'resolution',
      getDefaultVideoResolution(MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5) ??
        '',
      defaults,
    );
  });

  it('uses the Agent voice control when the prompt is empty', () => {
    const onStartListening = vi.fn();

    render(
      <StudioGenerateComposer
        {...baseProps}
        onStartListening={onStartListening}
        prompt=""
        settings={settings}
        shouldShowVoiceInput
        type="image"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start voice input' }));

    expect(onStartListening).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole('button', { name: 'Generate' }),
    ).not.toBeInTheDocument();
  });

  it('shows labeled frame and video-reference controls for a capable model', () => {
    render(
      <StudioGenerateComposer
        {...baseProps}
        prompt="Continue the motion"
        settings={{
          ...settings,
          modelKey: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
          resolution: '720p',
        }}
        type="video"
      />,
    );

    expect(screen.getByRole('button', { name: 'Start Frame' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'End Frame' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Video Reference' }),
    ).toBeVisible();
  });

  it('blocks a required image-to-video model with an inline first-frame error', () => {
    const props = {
      ...baseProps,
      models: [
        {
          category: ModelCategory.VIDEO,
          cost: 20,
          isActive: true,
          key: MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
          label: 'Hailuo Fast',
          lifecycle: ModelLifecycle.AVAILABLE,
          provider: ModelProvider.REPLICATE,
        },
      ] as never,
      prompt: 'Move the subject toward camera',
      settings: {
        ...settings,
        modelKey: MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
      },
      type: 'video' as const,
    };
    const { rerender } = render(<StudioGenerateComposer {...props} />);

    expect(screen.getByText('Start Frame required')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();

    rerender(
      <StudioGenerateComposer
        {...props}
        attachedAssets={[
          {
            id: 'frame-1',
            kind: 'image',
            role: 'startFrame',
            source: 'library',
          },
        ]}
      />,
    );

    expect(screen.queryByText('Start Frame required')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled();
  });

  it('blocks Seedance when frames and a video reference are combined', () => {
    render(
      <StudioGenerateComposer
        {...baseProps}
        attachedAssets={[
          {
            id: 'frame-1',
            kind: 'image',
            role: 'startFrame',
            source: 'library',
          },
          {
            id: 'video-1',
            kind: 'video',
            role: 'videoReference',
            source: 'library',
          },
        ]}
        prompt="Follow the source motion"
        settings={{
          ...settings,
          modelKey: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
        }}
        type="video"
      />,
    );

    expect(
      screen.getByText('Seedance uses frames or a video reference, not both'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
  });

  it('updates the pre-send credit quote for the selected resolution', () => {
    const model = {
      category: ModelCategory.VIDEO,
      isActive: true,
      lifecycle: ModelLifecycle.AVAILABLE,
      provider: ModelProvider.REPLICATE,
      label: 'Kling',
      cost: 50,
      costPerUnit: 10,
      key: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO,
      pricingType: 'per-second',
    };
    estimateMocks.resolve.mockImplementation(
      (request: { resolution?: string }) => ({
        credits: request.resolution === '4k' ? 125 : 50,
        status: 'estimated',
      }),
    );
    const props = {
      ...baseProps,
      models: [model] as never,
      prompt: 'A cinematic reveal',
      type: 'video' as const,
    };
    const { rerender } = render(
      <StudioGenerateComposer
        {...props}
        settings={{
          ...settings,
          duration: 5,
          modelKey: model.key,
          resolution: 'standard',
        }}
      />,
    );

    expect(screen.getByText('~50')).toBeVisible();

    rerender(
      <StudioGenerateComposer
        {...props}
        settings={{
          ...settings,
          duration: 5,
          modelKey: model.key,
          resolution: '4k',
        }}
      />,
    );

    expect(screen.getByText('~125')).toBeVisible();
    expect(estimateMocks.resolve).toHaveBeenLastCalledWith(
      expect.objectContaining({
        category: 'video',
        modelKey: model.key,
        resolution: '4k',
      }),
    );
  });

  describe('Enhance prompt action (#4676)', () => {
    it('is absent when no onEnhancePrompt handler is supplied', () => {
      render(
        <StudioGenerateComposer
          {...baseProps}
          prompt="A product photo"
          settings={settings}
          type="image"
        />,
      );

      expect(
        screen.queryByRole('button', { name: 'Enhance prompt' }),
      ).not.toBeInTheDocument();
    });

    it('calls onEnhancePrompt and never touches onSubmit', () => {
      const onEnhancePrompt = vi.fn();
      render(
        <StudioGenerateComposer
          {...baseProps}
          onEnhancePrompt={onEnhancePrompt}
          prompt="A product photo"
          settings={settings}
          type="image"
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Enhance prompt' }));

      expect(onEnhancePrompt).toHaveBeenCalledOnce();
      expect(baseProps.onSubmit).not.toHaveBeenCalled();
    });

    it('disables the Enhance action for an empty prompt', () => {
      render(
        <StudioGenerateComposer
          {...baseProps}
          onEnhancePrompt={vi.fn()}
          prompt=""
          settings={settings}
          type="image"
        />,
      );

      expect(
        screen.getByRole('button', { name: 'Enhance prompt' }),
      ).toBeDisabled();
    });

    it('swaps to a clickable Cancel action while enhancing — the composer stays usable', () => {
      const onCancelEnhancePrompt = vi.fn();
      render(
        <StudioGenerateComposer
          {...baseProps}
          isEnhancingPrompt
          onCancelEnhancePrompt={onCancelEnhancePrompt}
          onEnhancePrompt={vi.fn()}
          prompt="A product photo"
          settings={settings}
          type="image"
        />,
      );

      const cancelButton = screen.getByRole('button', {
        name: 'Cancel enhancing prompt',
      });
      expect(cancelButton).toBeEnabled();

      fireEvent.click(cancelButton);
      expect(onCancelEnhancePrompt).toHaveBeenCalledOnce();
    });

    it('shows Undo only once an enhancement has replaced the prompt, not while pending', () => {
      const onUndoEnhancePrompt = vi.fn();
      const { rerender } = render(
        <StudioGenerateComposer
          {...baseProps}
          isEnhancingPrompt
          onEnhancePrompt={vi.fn()}
          onUndoEnhancePrompt={onUndoEnhancePrompt}
          previousPrompt="The original prompt"
          prompt="An enhanced prompt"
          settings={settings}
          type="image"
        />,
      );

      expect(
        screen.queryByRole('button', { name: 'Undo prompt enhancement' }),
      ).not.toBeInTheDocument();

      rerender(
        <StudioGenerateComposer
          {...baseProps}
          isEnhancingPrompt={false}
          onEnhancePrompt={vi.fn()}
          onUndoEnhancePrompt={onUndoEnhancePrompt}
          previousPrompt="The original prompt"
          prompt="An enhanced prompt"
          settings={settings}
          type="image"
        />,
      );

      const undoButton = screen.getByRole('button', {
        name: 'Undo prompt enhancement',
      });
      fireEvent.click(undoButton);
      expect(onUndoEnhancePrompt).toHaveBeenCalledOnce();
    });
  });
  it('distinguishes Auto, catalog loading, missing pricing and live wallet states', () => {
    const props = {
      ...baseProps,
      prompt: 'A product photo',
      settings,
      type: 'image' as const,
    };
    const { rerender } = render(<StudioGenerateComposer {...props} />);
    expect(
      screen.getByLabelText('Estimate available after model selection'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: '120 available' })).toHaveAttribute(
      'href',
      '/test-org/settings/credits',
    );
    expect(screen.getByText('Auto · 1:1 · 1K · 1 output')).toBeVisible();
    Object.assign(walletMocks, {
      balance: null,
      isLoaded: false,
      isLoading: true,
    });
    rerender(<StudioGenerateComposer {...props} isLoadingModels />);
    expect(screen.getByLabelText('Loading estimate…')).toBeVisible();
    expect(screen.getByLabelText('Loading balance…')).toBeVisible();
    Object.assign(walletMocks, {
      balance: null,
      isLoaded: true,
      isLoading: false,
    });
    rerender(
      <StudioGenerateComposer
        {...props}
        settings={{ ...settings, modelKey: 'missing' }}
      />,
    );
    expect(
      screen.getByLabelText('This model is not available for your workspace.'),
    ).toBeVisible();
    expect(screen.getByLabelText('Balance unavailable')).toBeVisible();
    walletMocks.balance = 0;
    rerender(<StudioGenerateComposer {...props} />);
    expect(screen.getByRole('link', { name: '0 available' })).toBeVisible();
    walletMocks.balance = Number.NaN;
    rerender(<StudioGenerateComposer {...props} />);
    expect(screen.getByLabelText('Balance unavailable')).toBeVisible();
    walletMocks.showCredits = false;
    rerender(<StudioGenerateComposer {...props} />);
    expect(
      screen.queryByLabelText('Estimate available after model selection'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Balance unavailable'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Auto · 1:1 · 1K · 1 output')).toBeVisible();
  });

  it('updates image count, setup and total, and blocks Generate when admission would refuse the price', () => {
    const model = {
      category: ModelCategory.IMAGE,
      cost: 8,
      isActive: true,
      key: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
      label: 'Imagen 4',
      lifecycle: ModelLifecycle.AVAILABLE,
      provider: ModelProvider.REPLICATE,
    };
    const props = {
      ...baseProps,
      models: [model] as never,
      prompt: 'A product photo',
      type: 'image' as const,
    };
    estimateMocks.resolve.mockImplementation(
      (request: { outputs?: number }) => ({
        credits: 8 * (request.outputs ?? 1),
        status: 'estimated',
      }),
    );
    const { rerender } = render(
      <StudioGenerateComposer
        {...props}
        settings={{ ...settings, modelKey: model.key }}
      />,
    );
    expect(screen.getByText('~8')).toBeVisible();
    rerender(
      <StudioGenerateComposer
        {...props}
        settings={{
          ...settings,
          modelKey: model.key,
          outputs: 3,
          aspectRatio: '9:16',
          resolution: '2K',
        }}
      />,
    );
    expect(screen.getByText('~24')).toBeVisible();
    expect(screen.getByText('Imagen 4 · 9:16 · 2K · 3 outputs')).toBeVisible();
    estimateMocks.resolve.mockReturnValue({
      credits: null,
      status: 'unavailable',
      unavailableReason: 'PRICING_UNRESOLVED',
    });
    rerender(
      <StudioGenerateComposer
        {...props}
        settings={{ ...settings, modelKey: model.key }}
      />,
    );
    expect(
      screen.getByLabelText('This model has no confirmed price yet.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
    expect(baseProps.onSubmit).not.toHaveBeenCalled();
  });

  it.each([
    ['MODEL_UNAVAILABLE', true],
    ['MISSING_SETTING', true],
    ['ERROR', false],
    [undefined, false],
  ])(
    'submit gate for estimate reason %s is blocked=%s',
    (reason, isBlocked) => {
      const model = {
        category: ModelCategory.IMAGE,
        cost: 8,
        isActive: true,
        key: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
        label: 'Imagen 4',
        lifecycle: ModelLifecycle.AVAILABLE,
        provider: ModelProvider.REPLICATE,
      };
      estimateMocks.resolve.mockReturnValue({
        credits: null,
        status: 'unavailable',
        unavailableReason: reason,
      });
      render(
        <StudioGenerateComposer
          {...baseProps}
          models={[model] as never}
          prompt="A product photo"
          settings={{ ...settings, modelKey: model.key }}
          type="image"
        />,
      );
      const button = screen.getByRole('button', { name: 'Generate' });
      if (isBlocked) expect(button).toBeDisabled();
      else expect(button).toBeEnabled();
    },
  );

  it('blocks Generate for a concrete model missing from the catalog, so no other model is substituted', () => {
    render(
      <StudioGenerateComposer
        {...baseProps}
        models={[]}
        prompt="A product photo"
        settings={{
          ...settings,
          modelKey: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
        }}
        type="image"
      />,
    );
    expect(
      screen.getByLabelText('This model is not available for your workspace.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
  });

  it('never blocks Generate while the estimate is loading', () => {
    const model = {
      category: ModelCategory.IMAGE,
      cost: 8,
      isActive: true,
      key: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
      label: 'Imagen 4',
      lifecycle: ModelLifecycle.AVAILABLE,
      provider: ModelProvider.REPLICATE,
    };
    render(
      <StudioGenerateComposer
        {...baseProps}
        models={[model] as never}
        prompt="A product photo"
        settings={{ ...settings, modelKey: model.key }}
        type="image"
      />,
    );
    expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled();
  });

  it('sends the audio toggle with a video estimate request', () => {
    const model = {
      category: ModelCategory.VIDEO,
      cost: 50,
      isActive: true,
      key: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO,
      label: 'Kling',
      lifecycle: ModelLifecycle.AVAILABLE,
      provider: ModelProvider.REPLICATE,
    };
    estimateMocks.resolve.mockReturnValue({ credits: 9, status: 'estimated' });
    render(
      <StudioGenerateComposer
        {...baseProps}
        models={[model] as never}
        prompt="A reveal"
        settings={{
          ...settings,
          duration: 5,
          isAudioEnabled: true,
          modelKey: model.key,
        }}
        type="video"
      />,
    );
    expect(estimateMocks.resolve).toHaveBeenLastCalledWith(
      expect.objectContaining({ duration: 5, isAudioEnabled: true }),
    );
  });

  describe('image editing composer', () => {
    const editModel = {
      key: MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_4_5,
      category: ModelCategory.IMAGE_EDIT,
      provider: ModelProvider.REPLICATE,
      isDefault: true,
      isActive: true,
      cost: 20,
      label: 'Ideogram 4.5',
    } as IModel;
    it('makes no estimate call in Auto even though an editing default exists', () => {
      estimateMocks.resolve.mockImplementation(
        (request: { outputs?: number }) => ({
          credits: 20 * (request.outputs ?? 1),
          status: 'estimated',
        }),
      );
      render(
        <StudioGenerateComposer
          {...baseProps}
          models={[editModel]}
          prompt="Change the sign"
          settings={{
            ...settings,
            modelKey: AUTO_MODEL_OPTION_VALUE,
            outputs: 3,
          }}
          type="image-edit"
        />,
      );
      expect(
        screen.getByLabelText('Estimate available after model selection'),
      ).toBeVisible();
      expect(estimateMocks.resolve).not.toHaveBeenCalled();
      expect(screen.getByText('Auto (Ideogram 4.5) · 3 outputs')).toBeVisible();
    });
    it('blocks submission without a source and never offers prompt enhancement', () => {
      render(
        <StudioGenerateComposer
          {...baseProps}
          models={[editModel]}
          prompt="Change the sign"
          settings={{ ...settings, modelKey: editModel.key }}
          type="image-edit"
          onEnhancePrompt={vi.fn()}
        />,
      );
      expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
      expect(
        screen.getByText('Choose a source image to edit.'),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Enhance prompt' }),
      ).not.toBeInTheDocument();
    });
    it('forces source dimensions for a mask, preserves seed zero and hides character extensions', () => {
      render(
        <StudioGenerateComposer
          {...baseProps}
          models={[editModel]}
          prompt="Change the sign"
          settings={{
            ...settings,
            modelKey: editModel.key,
            editSeed: 0,
            editSize: '1024x1024',
          }}
          type="image-edit"
          extraExtensions={[]}
          attachedAssets={[
            {
              id: 'source',
              ingredientId: 'source',
              kind: 'image',
              source: 'library',
              role: 'editSource',
              name: 'Target',
              previewUrl: 'https://example.com/source.png',
            },
            {
              id: 'mask',
              ingredientId: 'mask',
              kind: 'image',
              source: 'library',
              role: 'editMask',
              name: 'Mask',
              previewUrl: 'https://example.com/mask.png',
            },
          ]}
        />,
      );
      expect(
        screen.getByRole('combobox', { name: 'Editing output size' }),
      ).toBeDisabled();
      expect(screen.getByLabelText('Editing seed')).toHaveValue(0);
      expect(promptEditorProps.extraExtensions).toBeUndefined();
      expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled();
    });
  });
});

describe('FLUX.3 composer controls', () => {
  const fluxModel = {
    key: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE_EDIT,
    category: ModelCategory.IMAGE_EDIT,
    provider: ModelProvider.REPLICATE,
    isActive: true,
    cost: 8,
    label: 'FLUX.3 Edit',
    reviewedProviderContractVersion: 'reviewed',
  } as IModel;
  it('shows native controls and ten sources without Ideogram mask, seed or size', () => {
    estimateMocks.resolve.mockReturnValue({ credits: 12, status: 'estimated' });
    render(
      <StudioGenerateComposer
        {...baseProps}
        type="image-edit"
        models={[fluxModel]}
        prompt="Change the sign"
        settings={{
          ...settings,
          modelKey: fluxModel.key,
          resolution: '1.5k',
          aspectRatio: 'auto',
        }}
        attachedAssets={Array.from({ length: 10 }, (_, i) => ({
          id: `source${i}`,
          ingredientId: `source${i}`,
          kind: 'image' as const,
          source: 'library' as const,
          role: 'editSource' as const,
          name: `Source ${i}`,
          previewUrl: 'https://example.com/image.png',
        }))}
      />,
    );
    expect(
      screen.getByRole('combobox', { name: 'FLUX resolution' }),
    ).toBeVisible();
    expect(
      screen.getByRole('combobox', { name: 'FLUX aspect ratio' }),
    ).toBeVisible();
    expect(screen.queryByLabelText('Editing seed')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Editing output size'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Mask (optional)')).not.toBeInTheDocument();
    expect(screen.getByText('~12')).toBeVisible();
    expect(
      screen.getByRole('combobox', { name: 'Image editing target' }),
    ).toBeVisible();
    expect(
      screen.getByText(
        'First source is the target. 10/10 sources. One output. No mask or seed.',
      ),
    ).toBeVisible();
    expect(screen.getByText('Source images')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled();
    expect(generationSetupPopoverMocks.props.capabilities).toMatchObject({
      hasOutputs: false,
      hasAspectRatio: false,
    });
  });
  it('clears incompatible settings with a visible explanation', () => {
    const onSettingsChange = vi.fn(),
      onRemoveAttachedAsset = vi.fn();
    render(
      <StudioGenerateComposer
        {...baseProps}
        type="image-edit"
        models={[fluxModel]}
        prompt="Change"
        onSettingsChange={onSettingsChange}
        onRemoveAttachedAsset={onRemoveAttachedAsset}
        settings={{
          ...settings,
          modelKey: fluxModel.key,
          editSeed: 0,
          outputs: 4,
        }}
        attachedAssets={[
          {
            id: 'mask',
            kind: 'image',
            source: 'library',
            role: 'editMask',
            previewUrl: 'https://example.com/image.png',
          },
        ]}
      />,
    );
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        resolution: '1k',
        outputs: 1,
        editSeed: undefined,
      }),
    );
    expect(onRemoveAttachedAsset).toHaveBeenCalledWith('mask');
    expect(
      screen.getByText('Mask and seed settings were removed for FLUX.3.'),
    ).toBeVisible();
  });
});

function controlsFor(endpoint = 'kling/v2-5-turbo-pro'): CrunInputControls {
  const kling = endpoint === 'kling/v2-5-turbo-pro';
  return {
    endpoint,
    version: 'reviewed-video-v1',
    mediaKind: 'video',
    maxOutputs: 4,
    isBatchSupported: false,
    isAutoAspectReferenceRequired: false,
    referenceRoles: kling ? { img_urls: 'image' } : {},
    videoRules: {
      referenceMode: kling ? 'start-end' : 'none',
      omitAspectRatioWithReferences: kling,
      availableDurations: kling ? [5, 10] : [8],
    },
    fields: {
      prompt: {
        type: 'string',
        isRequired: true,
        minLength: 1,
        maxLength: kling ? 2500 : 5000,
      },
      duration: {
        type: 'integer',
        isRequired: false,
        enum: kling ? [5, 10] : [4, 6, 8],
        default: kling ? 5 : 8,
      },
      aspect_ratio: {
        type: 'string',
        isRequired: false,
        enum: kling ? ['1:1', '16:9', '9:16'] : ['16:9', '9:16'],
        default: '16:9',
      },
      ...(kling
        ? {
            negative_prompt: {
              type: 'string' as const,
              isRequired: false,
              maxLength: 2000,
            },
            cfg_scale: {
              type: 'number' as const,
              isRequired: false,
              minimum: 0,
              maximum: 1,
              default: 0.5,
            },
            img_urls: {
              type: 'array' as const,
              isRequired: false,
              format: 'uri' as const,
              minItems: 1,
              maxItems: 2,
            },
          }
        : {
            resolution: {
              type: 'string' as const,
              isRequired: false,
              enum: ['720p', '1080p', '4k'],
              default: '720p',
            },
            translate_prompt: {
              type: 'boolean' as const,
              isRequired: false,
              default: true,
            },
          }),
    },
  };
}

describe('complete reviewed Studio video scalar composition', () => {
  it.each(['kling/v2-5-turbo-pro', 'google/veo3-1-fast-t2v'])(
    'mounts one scalar owner and no mandatory first frame for %s',
    (endpoint) => {
      const controls = controlsFor(endpoint);
      const kling = endpoint.startsWith('kling/');
      const key = `crun/${endpoint}`;
      const model: IModel = {
        id: 'video-model',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
        key,
        label: 'Reviewed video',
        category: ModelCategory.VIDEO,
        provider: ModelProvider.CRUN,
        cost: 999,
        isActive: true,
        isDefault: false,
        isDeleted: false,
        lifecycle: ModelLifecycle.AVAILABLE,
      };
      model.inputControls = controls;
      const quote = {
        isAvailable: true as const,
        modelKey: key,
        contractVersion: controls.version,
        quoteId: 'video-quote',
        expiresAt: '2099-01-01T00:00:00.000Z',
        credits: 11,
        billingMode: 'credits' as const,
        reasonCode: null,
      };
      render(
        <StudioGenerateComposer
          {...baseProps}
          type="video"
          prompt="Motion"
          models={[model]}
          settings={{
            ...getDefaultStudioGenerateSettings('video'),
            modelKey: key,
            outputs: 4,
            aspectRatio: '16:9',
            duration: kling ? 5 : 8,
            resolution: kling ? '' : '720p',
            crunControls: {
              modelKey: key,
              contractVersion: controls.version,
              ...(kling ? { guidanceScale: 0 } : { translatePrompt: false }),
            },
          }}
          crunQuote={{
            status: 'available',
            quote,
            reasonCode: null,
            getCurrentQuote: () => quote,
          }}
        />,
      );
      expect(
        screen.getAllByRole('combobox', { name: 'Duration' }),
      ).toHaveLength(1);
      expect(
        screen.getAllByRole('combobox', { name: 'Aspect ratio' }),
      ).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled();
      expect(screen.getByText('~11', { exact: true })).toBeVisible();
      if (kling) {
        expect(
          screen.getByRole('spinbutton', { name: 'Guidance' }),
        ).toHaveValue(0);
        expect(
          screen.queryByRole('combobox', { name: 'Resolution' }),
        ).not.toBeInTheDocument();
      } else {
        expect(
          screen.getByRole('checkbox', {
            name: 'Translate prompt',
          }),
        ).not.toBeChecked();
        expect(
          screen.queryByRole('button', { name: 'Start frame' }),
        ).not.toBeInTheDocument();
      }
    },
  );
});
