import { RouterPriority } from '@genfeedai/enums';
import StudioGenerateSettingsPopover from '@pages/studio/generate/components/StudioGenerateSettingsPopover';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/data/elements/use-elements/use-elements', () => ({
  useElements: () => ({ moods: [], presets: [], scenes: [], styles: [] }),
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
});
