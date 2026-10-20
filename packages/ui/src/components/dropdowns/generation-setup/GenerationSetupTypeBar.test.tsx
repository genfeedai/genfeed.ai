import '@testing-library/jest-dom/vitest';
import { RouterPriority } from '@genfeedai/contracts';
import type { GenerationSetupTypeBarProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { fireEvent, render, screen } from '@testing-library/react';
import GenerationSetupTypeBar from '@ui/dropdowns/generation-setup/GenerationSetupTypeBar';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

function buildProps(
  overrides: Partial<GenerationSetupTypeBarProps> = {},
  type: 'image' | 'image-edit' | 'music' | 'video' = 'image',
): GenerationSetupTypeBarProps {
  return {
    setup: {
      sources: {},
      values: {
        type,
        aspectRatio: '1:1',
        modelKey: '',
        isPromptEnhanceEnabled: false,
        outputs: 1,
        brandingMode: 'off',
        prioritize: RouterPriority.BALANCED,
      },
    },
    typeOptions: [
      { label: 'Image', value: 'image' },
      { label: 'Video', value: 'video' },
      { label: 'Music', value: 'music' },
    ],
    ...overrides,
  };
}

describe('GenerationSetupTypeBar', () => {
  it('shows every type as an icon button and marks the current one', () => {
    render(<GenerationSetupTypeBar {...buildProps()} />);

    expect(screen.getByRole('button', { name: 'Image' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Video' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Image' })).not.toHaveTextContent(
      'Image',
    );
  });

  it('changes the type, and ignores a click on the current one', () => {
    const onTypeChange = vi.fn();
    render(<GenerationSetupTypeBar {...buildProps({ onTypeChange })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Image' }));
    expect(onTypeChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Video' }));
    expect(onTypeChange).toHaveBeenCalledWith('video');
  });

  it('offers Edit as a mode of Image, and only there', () => {
    const onChange = vi.fn();
    const imageEditing = { isEnabled: false, onChange };
    const { rerender } = render(
      <GenerationSetupTypeBar {...buildProps({ imageEditing })} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onChange).toHaveBeenCalledWith(true);

    rerender(
      <GenerationSetupTypeBar
        {...buildProps(
          { imageEditing: { isEnabled: true, onChange } },
          'image-edit',
        )}
      />,
    );
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    rerender(
      <GenerationSetupTypeBar {...buildProps({ imageEditing }, 'music')} />,
    );
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('shows Edit on Video too, switched off until video editing exists', () => {
    const onChange = vi.fn();
    render(
      <GenerationSetupTypeBar
        {...buildProps(
          { imageEditing: { isEnabled: false, onChange } },
          'video',
        )}
      />,
    );

    const edit = screen.getByRole('button', { name: 'Edit' });
    expect(edit).toBeDisabled();
    fireEvent.click(edit);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('switches between Auto and Advanced without changing layout', () => {
    const onChange = vi.fn();
    render(
      <GenerationSetupTypeBar
        {...buildProps({ advancedMode: { isEnabled: false, onChange } })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Auto' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
