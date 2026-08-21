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
});
