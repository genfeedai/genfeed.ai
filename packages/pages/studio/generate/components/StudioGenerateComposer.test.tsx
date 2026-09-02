import { RouterPriority } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { getDefaultVideoResolution } from '@genfeedai/helpers/media/video-resolution/video-resolution.helper';
import StudioGenerateComposer from '@pages/studio/generate/components/StudioGenerateComposer';
import { getDefaultGenerationSetupValues } from '@pages/studio/generate/utils/studio-generation-setup-bridge';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const remixMocks = vi.hoisted(() => ({ isRemixActive: false }));

vi.mock('@pages/studio/generate/StudioRemixRunScope', () => ({
  useStudioRemixRunScope: () => remixMocks.isRemixActive,
}));

const modelSelectorMocks = vi.hoisted(() => ({
  props: {} as { autoLabel?: string; values?: readonly string[] },
}));

vi.mock('@ui/dropdowns/model-selector/ModelSelectorPopover', () => ({
  default: (props: { autoLabel?: string; values?: readonly string[] }) => {
    modelSelectorMocks.props = props;
    return <button type="button">Generation settings</button>;
  },
}));

vi.mock(
  '@pages/studio/generate/components/StudioGenerateSettingsPopover',
  () => ({ default: () => <button type="button">Settings</button> }),
);

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
    remixMocks.isRemixActive = false;
    storeMocks.setupByScope = {};
    storeMocks.reasonsByScope = {};
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

  it('renders the unified GenerationSetupPopover for a non-Remix surface', () => {
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
        onTypeChange,
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
    expect(
      (
        generationSetupPopoverMocks.props.capabilities as {
          hasIdentity: boolean;
        }
      ).hasIdentity,
    ).toBe(false);
  });

  it('keeps the narrow output-only chrome for a Remix run', () => {
    remixMocks.isRemixActive = true;

    render(
      <StudioGenerateComposer
        {...baseProps}
        prompt="A product photo"
        settings={settings}
        type="image"
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Generation settings' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Settings' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Setup' }),
    ).not.toBeInTheDocument();
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
      cost: 50,
      costPerUnit: 10,
      key: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
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
          resolution: '720p',
        }}
      />,
    );

    expect(screen.getByText('~50 credits')).toBeVisible();

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

    expect(screen.getByText('~200 credits')).toBeVisible();
  });
});
