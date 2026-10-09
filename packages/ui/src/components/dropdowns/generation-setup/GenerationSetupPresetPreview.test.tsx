import { STUDIO_SYSTEM_PRESETS } from '@genfeedai/contracts/constants/studio-system-presets.constant';
import { render, screen } from '@testing-library/react';
import GenerationSetupPresetPreview from '@ui/dropdowns/generation-setup/GenerationSetupPresetPreview';
import { describe, expect, it } from 'vitest';

describe('GenerationSetupPresetPreview', () => {
  it('labels illustrative layouts honestly and activates motion only in the video preview', () => {
    const animation = STUDIO_SYSTEM_PRESETS.find(
      (p) => p.key === 'studio-animation',
    );
    if (!animation) throw new Error('Animation fixture missing');
    const view = render(<GenerationSetupPresetPreview preset={animation} />);
    const preview = screen.getByRole('img', {
      name: 'Animation illustrative template preview',
    });
    expect(preview.querySelector('.motion-safe\\:animate-spin')).toBeNull();
    view.rerender(
      <GenerationSetupPresetPreview preset={animation} isAnimated />,
    );
    expect(preview.querySelector('.motion-safe\\:animate-spin')).not.toBeNull();
    view.rerender(
      <GenerationSetupPresetPreview
        preset={STUDIO_SYSTEM_PRESETS[0]}
        isAnimated
      />,
    );
    expect(
      screen
        .getByRole('img', {
          name: 'Profile picture illustrative template preview',
        })
        .querySelector('[class*="animate-"]'),
    ).toBeNull();
  });
});
