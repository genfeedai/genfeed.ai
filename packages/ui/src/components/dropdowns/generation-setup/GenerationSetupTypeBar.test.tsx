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
      { label: 'Image', value: type === 'image-edit' ? 'image-edit' : 'image' },
      { label: 'Video', value: 'video' },
      { label: 'Music', value: 'music' },
    ],
    ...overrides,
  };
}

function openTypeMenu(): void {
  const trigger = screen.getByRole('button', { name: /Generation type/ });
  fireEvent.keyDown(trigger, { key: 'Enter' });
}

describe('GenerationSetupTypeBar', () => {
  it('shows the current type as one chip, labelled', () => {
    render(<GenerationSetupTypeBar {...buildProps()} />);

    expect(
      screen.getByRole('button', { name: 'Generation type: Image' }),
    ).toHaveTextContent('Image');
  });

  it('lists every type in the menu and changes it, ignoring the current one', () => {
    const onTypeChange = vi.fn();
    render(<GenerationSetupTypeBar {...buildProps({ onTypeChange })} />);

    openTypeMenu();
    expect(screen.getByRole('menuitemradio', { name: 'Image' })).toBeChecked();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Image' }));
    expect(onTypeChange).not.toHaveBeenCalled();

    openTypeMenu();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Video' }));
    expect(onTypeChange).toHaveBeenCalledWith('video');
  });

  it('offers Edit as a toggle under the types, a mode of Image', () => {
    const onChange = vi.fn();
    const imageEditing = { isEnabled: false, onChange };
    const { rerender } = render(
      <GenerationSetupTypeBar {...buildProps({ imageEditing })} />,
    );

    openTypeMenu();
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Edit' }));
    expect(onChange).toHaveBeenCalledWith(true);

    rerender(
      <GenerationSetupTypeBar
        {...buildProps(
          { imageEditing: { isEnabled: true, onChange } },
          'image-edit',
        )}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Generation type: Image · Edit' }),
    ).toBeInTheDocument();
    openTypeMenu();
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Edit' }),
    ).toBeChecked();
  });

  it('does not offer Edit on other types', () => {
    render(
      <GenerationSetupTypeBar
        {...buildProps(
          { imageEditing: { isEnabled: false, onChange: vi.fn() } },
          'music',
        )}
      />,
    );

    openTypeMenu();
    expect(screen.queryByRole('menuitemcheckbox', { name: 'Edit' })).toBeNull();
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

    openTypeMenu();
    const edit = screen.getByRole('menuitemcheckbox', { name: /Edit/ });
    expect(edit).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(edit);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('is one mode button that names the current mode and switches to the other', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <GenerationSetupTypeBar
        {...buildProps({ advancedMode: { isEnabled: false, onChange } })}
      />,
    );

    const auto = screen.getByRole('button', { name: 'Setup mode: Auto' });
    expect(auto).toHaveTextContent('Auto');
    fireEvent.click(auto);
    expect(onChange).toHaveBeenLastCalledWith(true);

    rerender(
      <GenerationSetupTypeBar
        {...buildProps({ advancedMode: { isEnabled: true, onChange } })}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Setup mode: Advanced' }),
    );
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('keeps the type chip but locks it when the surface offers one type', () => {
    render(
      <GenerationSetupTypeBar
        {...buildProps({ typeOptions: [{ label: 'Image', value: 'image' }] })}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Generation type: Image' }),
    ).toBeDisabled();
  });
});
