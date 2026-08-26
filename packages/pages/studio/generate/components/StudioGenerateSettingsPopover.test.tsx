import { RouterPriority } from '@genfeedai/enums';
import StudioGenerateSettingsPopover from '@pages/studio/generate/components/StudioGenerateSettingsPopover';
import { StudioRemixRunScope } from '@pages/studio/generate/StudioRemixRunScope';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/data/elements/use-elements/use-elements', () => ({
  useElements: () => ({
    cameraMovements: [],
    cameras: [],
    lenses: [],
    lightings: [],
    moods: [],
    presets: [],
    scenes: [],
    styles: [],
  }),
}));

vi.mock('@pages/studio/generate/hooks/useStudioLooks', () => ({
  useStudioLooks: () => ({
    deleteLook: vi.fn(),
    deletingId: null,
    error: null,
    isLoading: false,
    isSaving: false,
    looks: [],
    saveLook: vi.fn(),
  }),
}));

vi.mock('@pages/studio/generate/hooks/useStudioGenerateIdentities', () => ({
  useStudioGenerateIdentities: () => ({
    avatarOptions: [],
    isLoadingIdentities: false,
    voiceOptions: [],
  }),
}));

describe('StudioGenerateSettingsPopover', () => {
  it('uses ghost toolbar chrome for the settings summary', () => {
    render(
      <StudioGenerateSettingsPopover
        onChange={vi.fn()}
        onReset={vi.fn()}
        settings={{
          aspectRatio: '1:1',
          blacklist: [],
          brandingMode: 'brand',
          isAudioEnabled: false,
          modelKey: 'auto',
          outputs: 1,
          prioritize: RouterPriority.BALANCED,
          resolution: '1K',
          tags: [],
        }}
        type="image"
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Generation settings' });
    expect(trigger).not.toHaveClass('border', 'bg-background');

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    expect(
      screen.getByRole('button', { name: 'Look' }).querySelector('svg'),
    ).toHaveClass('size-4');
  });

  it('clamps remix duration to a bounded integer before settings change', () => {
    const onChange = vi.fn();
    render(
      <StudioRemixRunScope isActive>
        <StudioGenerateSettingsPopover
          onChange={onChange}
          onReset={vi.fn()}
          settings={{
            aspectRatio: '9:16',
            blacklist: [],
            brandingMode: 'brand',
            duration: 8,
            isAudioEnabled: false,
            modelKey: 'auto',
            outputs: 3,
            prioritize: RouterPriority.BALANCED,
            resolution: '720p',
            tags: [],
          }}
          type="video"
        />
      </StudioRemixRunScope>,
    );

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Generation settings' }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.change(screen.getByLabelText('Duration'), {
      target: { value: '5000.4' },
    });

    expect(onChange).toHaveBeenCalledWith({ duration: 300 });
  });
});
