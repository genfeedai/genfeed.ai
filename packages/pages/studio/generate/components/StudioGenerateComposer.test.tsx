import { MODEL_KEYS } from '@genfeedai/constants';
import { RouterPriority } from '@genfeedai/enums';
import StudioGenerateComposer from '@pages/studio/generate/components/StudioGenerateComposer';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@ui/dropdowns/model-selector/useModelFavorites', () => ({
  useModelFavorites: () => ({
    favoriteModelKeys: new Set<string>(),
    onFavoriteToggle: vi.fn(),
  }),
}));

vi.mock('@ui/dropdowns/model-selector/ModelSelectorPopover', () => ({
  default: () => <button type="button">Auto</button>,
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

vi.mock('@pages/studio/generate/components/StudioGenerateTypeSelector', () => ({
  default: () => <button type="button">Image</button>,
}));

vi.mock(
  '@pages/studio/generate/components/StudioGenerateSettingsPopover',
  () => ({ default: () => <button type="button">Settings</button> }),
);

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

describe('StudioGenerateComposer', () => {
  it('applies studio extraExtensions to the prompt editor', () => {
    const extraExtensions = [{ name: 'characterMention' }];
    render(
      <StudioGenerateComposer
        attachedAssets={[]}
        extraExtensions={extraExtensions as never}
        isGenerating={false}
        isLoadingModels={false}
        isListening={false}
        isTranscribing={false}
        isUploading={false}
        models={[]}
        onAddFiles={vi.fn()}
        onOpenLibrary={vi.fn()}
        onPromptChange={vi.fn()}
        onRemoveAttachedAsset={vi.fn()}
        onResetSettings={vi.fn()}
        onSettingsChange={vi.fn()}
        onStartListening={vi.fn()}
        onStopListening={vi.fn()}
        onSubmit={vi.fn()}
        onTypeChange={vi.fn()}
        prompt="A product photo"
        settings={settings}
        shouldShowVoiceInput={false}
        type="image"
      />,
    );

    expect(promptEditorProps.extraExtensions).toBe(extraExtensions);
  });

  it('keeps Studio selectors grouped and adds Agent reference controls', () => {
    const onAddFiles = vi.fn();
    const onOpenLibrary = vi.fn();

    render(
      <StudioGenerateComposer
        attachedAssets={[]}
        isGenerating={false}
        isLoadingModels={false}
        isListening={false}
        isTranscribing={false}
        isUploading={false}
        models={[]}
        onAddFiles={onAddFiles}
        onOpenLibrary={onOpenLibrary}
        onPromptChange={vi.fn()}
        onRemoveAttachedAsset={vi.fn()}
        onResetSettings={vi.fn()}
        onSettingsChange={vi.fn()}
        onStartListening={vi.fn()}
        onStopListening={vi.fn()}
        onSubmit={vi.fn()}
        onTypeChange={vi.fn()}
        prompt="A product photo"
        settings={settings}
        shouldShowVoiceInput={false}
        type="image"
      />,
    );

    expect(screen.getByRole('button', { name: 'Image' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Auto' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Settings' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add context' }));
    expect(
      screen.getByRole('menuitem', { name: 'Attach files' }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Reference library content' }),
    );
    expect(onOpenLibrary).toHaveBeenCalledOnce();
  });

  it('uses the Agent voice control when the prompt is empty', () => {
    const onStartListening = vi.fn();

    render(
      <StudioGenerateComposer
        attachedAssets={[]}
        isGenerating={false}
        isLoadingModels={false}
        isListening={false}
        isTranscribing={false}
        isUploading={false}
        models={[]}
        onAddFiles={vi.fn()}
        onOpenLibrary={vi.fn()}
        onPromptChange={vi.fn()}
        onRemoveAttachedAsset={vi.fn()}
        onResetSettings={vi.fn()}
        onSettingsChange={vi.fn()}
        onStartListening={onStartListening}
        onStopListening={vi.fn()}
        onSubmit={vi.fn()}
        onTypeChange={vi.fn()}
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
        attachedAssets={[]}
        isGenerating={false}
        isLoadingModels={false}
        isListening={false}
        isTranscribing={false}
        isUploading={false}
        models={[]}
        onAddFiles={vi.fn()}
        onOpenLibrary={vi.fn()}
        onPromptChange={vi.fn()}
        onRemoveAttachedAsset={vi.fn()}
        onResetSettings={vi.fn()}
        onSettingsChange={vi.fn()}
        onStartListening={vi.fn()}
        onStopListening={vi.fn()}
        onSubmit={vi.fn()}
        onTypeChange={vi.fn()}
        prompt="Continue the motion"
        settings={{
          ...settings,
          modelKey: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
          resolution: '720p',
        }}
        shouldShowVoiceInput={false}
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
      isGenerating: false,
      isLoadingModels: false,
      isListening: false,
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
      prompt: 'Move the subject toward camera',
      settings: {
        ...settings,
        modelKey: MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
      },
      shouldShowVoiceInput: false,
      type: 'video' as const,
    };
    const { rerender } = render(
      <StudioGenerateComposer {...props} attachedAssets={[]} />,
    );

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
        isGenerating={false}
        isLoadingModels={false}
        isListening={false}
        isTranscribing={false}
        isUploading={false}
        models={[]}
        onAddFiles={vi.fn()}
        onOpenLibrary={vi.fn()}
        onPromptChange={vi.fn()}
        onRemoveAttachedAsset={vi.fn()}
        onResetSettings={vi.fn()}
        onSettingsChange={vi.fn()}
        onStartListening={vi.fn()}
        onStopListening={vi.fn()}
        onSubmit={vi.fn()}
        onTypeChange={vi.fn()}
        prompt="Follow the source motion"
        settings={{
          ...settings,
          modelKey: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
        }}
        shouldShowVoiceInput={false}
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
      attachedAssets: [],
      isGenerating: false,
      isListening: false,
      isLoadingModels: false,
      isTranscribing: false,
      isUploading: false,
      models: [model],
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
      prompt: 'A cinematic reveal',
      shouldShowVoiceInput: false,
      type: 'video' as const,
    };
    const { rerender } = render(
      <StudioGenerateComposer
        {...props}
        models={props.models as never}
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
        models={props.models as never}
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
