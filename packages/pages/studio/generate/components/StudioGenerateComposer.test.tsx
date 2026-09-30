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
    return <button type="button">Setup</button>;
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

const promptEditorProps: { extraExtensions?: unknown } = {};

vi.mock('@ui/prompt-editor/PromptEditor', () => ({
  default: ({
    extraExtensions,
    testId,
    value,
  }: {
    extraExtensions?: unknown;
    testId?: string;
    value?: string;
  }) => {
    promptEditorProps.extraExtensions = extraExtensions;
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

    expect(screen.getByText('Estimated 50 credits')).toBeVisible();

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

    expect(screen.getByText('Estimated 125 credits')).toBeVisible();
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
      screen.getByText('Estimate available after model selection'),
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
    expect(screen.getByText('Loading estimate…')).toBeVisible();
    expect(screen.getByText('Loading balance…')).toBeVisible();
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
    expect(screen.getByText('Estimate unavailable')).toBeVisible();
    expect(screen.getByText('Balance unavailable')).toBeVisible();
    walletMocks.balance = 0;
    rerender(<StudioGenerateComposer {...props} />);
    expect(screen.getByText('0 available')).toBeVisible();
    walletMocks.balance = Number.NaN;
    rerender(<StudioGenerateComposer {...props} />);
    expect(screen.getByText('Balance unavailable')).toBeVisible();
    walletMocks.showCredits = false;
    rerender(<StudioGenerateComposer {...props} />);
    expect(
      screen.queryByText('Estimate available after model selection'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Balance unavailable')).not.toBeInTheDocument();
    expect(screen.getByText('Auto · 1:1 · 1K · 1 output')).toBeVisible();
  });

  it('updates image count, setup and total without using the estimate as a submit gate', () => {
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
    const { rerender } = render(
      <StudioGenerateComposer
        {...props}
        settings={{ ...settings, modelKey: model.key }}
      />,
    );
    expect(screen.getByText('Estimated 8 credits')).toBeVisible();
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
    expect(screen.getByText('Estimated 24 credits')).toBeVisible();
    expect(screen.getByText('Imagen 4 · 9:16 · 2K · 3 outputs')).toBeVisible();
    rerender(
      <StudioGenerateComposer
        {...props}
        models={[{ ...model, cost: 0 }] as never}
        settings={{ ...settings, modelKey: model.key }}
      />,
    );
    expect(screen.getByText('Estimate unavailable')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled();
  });
});
