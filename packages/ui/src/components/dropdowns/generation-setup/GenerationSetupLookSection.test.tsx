import type { GenerationSetup } from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import { render, screen } from '@testing-library/react';
import GenerationSetupLookSection from '@ui/dropdowns/generation-setup/GenerationSetupLookSection';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@ui/primitives/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => <ul>{children}</ul>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <li data-value={value}>{children}</li>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
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
