import type { GenerationSetup } from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GenerationSetupLookSection from '@ui/dropdowns/generation-setup/GenerationSetupLookSection';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const originalScrollIntoView = Element.prototype.scrollIntoView;
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterAll(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

describe('GenerationSetupLookSection', () => {
  it('marks platform default elements with a Default label', async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByRole('combobox', { name: 'Style' }));
    expect(screen.getByRole('option', { name: /Anime/ })).toHaveTextContent(
      'Default',
    );
    expect(
      screen.getByRole('option', { name: 'My style' }),
    ).not.toHaveTextContent('Default');
  });

  it('keeps one Look dropdown open inside the setup popover and closes it after selection', async () => {
    const user = userEvent.setup();
    const onSetField = vi.fn();
    render(
      <Popover defaultOpen>
        <PopoverTrigger asChild>
          <Button>Setup</Button>
        </PopoverTrigger>
        <PopoverContent>
          <GenerationSetupLookSection
            lookOptions={{
              style: [{ key: 'cinema', label: 'Cinema' }],
              mood: [{ key: 'calm', label: 'Calm' }],
              lighting: [{ key: 'studio', label: 'Studio' }],
            }}
            onSetField={onSetField}
            onResetField={vi.fn()}
            reasons={{}}
            setup={{ sources: {}, values: {} } as unknown as GenerationSetup}
          />
        </PopoverContent>
      </Popover>,
    );
    await user.click(screen.getByRole('combobox', { name: 'Style' }));
    expect(
      screen.getByRole('combobox', { name: 'Search style' }),
    ).toBeVisible();
    await user.click(screen.getByRole('combobox', { name: 'Mood' }));
    expect(
      screen.queryByRole('combobox', { name: 'Search style' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Search mood' })).toBeVisible();
    await user.click(screen.getByRole('option', { name: 'Calm' }));
    expect(onSetField).toHaveBeenCalledExactlyOnceWith('mood', 'calm');
    expect(
      screen.queryByRole('combobox', { name: 'Search mood' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Lighting' })).toBeVisible();
    await user.click(screen.getByRole('combobox', { name: 'Lighting' }));
    await user.keyboard('{ArrowDown}{Enter}');
    expect(
      screen.queryByRole('combobox', { name: 'Search lighting' }),
    ).not.toBeInTheDocument();
    expect(onSetField).toHaveBeenLastCalledWith('lighting', 'studio');
  });
});
