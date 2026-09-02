import { RouterPriority } from '@genfeedai/contracts';
import StudioGenerateSettingsPopover from '@pages/studio/generate/components/StudioGenerateSettingsPopover';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('StudioGenerateSettingsPopover', () => {
  it('uses bordered toolbar chrome and shows the output summary', () => {
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
    expect(trigger).toHaveClass('border', 'bg-background');
    expect(trigger).toHaveTextContent('1:1 · 1x');
  });

  it('clamps remix duration to a bounded integer before settings change', () => {
    const onChange = vi.fn();
    render(
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
      />,
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

  it('resets settings via the Reset action', () => {
    const onReset = vi.fn();
    render(
      <StudioGenerateSettingsPopover
        onChange={vi.fn()}
        onReset={onReset}
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

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Generation settings' }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(onReset).toHaveBeenCalled();
  });
});
