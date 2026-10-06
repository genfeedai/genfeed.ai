import type { GenerationSetup } from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import type { GenerationSetupOptionPickerProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { render, screen } from '@testing-library/react';
import GenerationSetupLookSection from '@ui/dropdowns/generation-setup/GenerationSetupLookSection';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@ui/dropdowns/generation-setup/GenerationSetupOptionPicker', () => ({
  default: ({ options }: GenerationSetupOptionPickerProps) => (
    <ul>
      {options.map((option) => (
        <li key={option.value}>
          <span>{option.label}</span>
          {option.isPlatformDefault ? ' Default' : ''}
        </li>
      ))}
    </ul>
  ),
}));

describe('GenerationSetupLookSection', () => {
  it('marks platform default elements with a Default label', () => {
    render(
      <GenerationSetupLookSection
        lookOptions={{
          style: [
            { isPlatformDefault: true, key: 'anime', label: 'Anime' },
            { key: 'my-style', label: 'My style' },
          ],
        }}
        onResetField={vi.fn()}
        onSetField={vi.fn()}
        reasons={{}}
        setup={{ sources: {}, values: {} } as unknown as GenerationSetup}
      />,
    );

    expect(screen.getByText('Anime').closest('li')).toHaveTextContent(
      'Default',
    );
    expect(screen.getByText('My style').closest('li')).not.toHaveTextContent(
      'Default',
    );
  });
});
