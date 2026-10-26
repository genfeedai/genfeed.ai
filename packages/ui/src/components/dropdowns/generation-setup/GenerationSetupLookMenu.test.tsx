import '@testing-library/jest-dom/vitest';
import { RouterPriority } from '@genfeedai/contracts';
import type { GenerationSetup } from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import type { GenerationSetupLookOptions } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { fireEvent, render, screen } from '@testing-library/react';
import GenerationSetupLookMenu from '@ui/dropdowns/generation-setup/GenerationSetupLookMenu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const setup: GenerationSetup = {
  sources: { style: 'user' },
  values: {
    aspectRatio: '1:1',
    brandingMode: 'off',
    isPromptEnhanceEnabled: false,
    modelKey: '',
    outputs: 1,
    prioritize: RouterPriority.BALANCED,
    style: 'noir',
    type: 'image',
  },
};

function renderMenu(lookOptions?: GenerationSetupLookOptions) {
  const onSetField = vi.fn();
  const onResetField = vi.fn();
  render(
    <DropdownMenu modal={false} open>
      <DropdownMenuTrigger>open</DropdownMenuTrigger>
      <DropdownMenuContent>
        <GenerationSetupLookMenu
          lookOptions={
            lookOptions ?? {
              lighting: [
                { key: 'golden-hour', label: 'Golden hour' },
                { key: 'neon', label: 'Neon' },
              ],
              style: [
                { key: 'noir', label: 'Noir' },
                { key: 'pop', label: 'Pop art' },
              ],
            }
          }
          onResetField={onResetField}
          onSetField={onSetField}
          setup={setup}
        />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  return { onResetField, onSetField };
}

describe('GenerationSetupLookMenu', () => {
  it('lists a row per Look field that has options, with its current value', () => {
    renderMenu();

    expect(screen.getByRole('menuitem', { name: /Style/ })).toHaveTextContent(
      'Noir',
    );
    expect(screen.getByRole('menuitem', { name: /Lighting/ })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: /Lens/ })).toBeNull();
  });

  it('nests the options under the field, searchable', () => {
    const { onSetField } = renderMenu();
    fireEvent.keyDown(screen.getByRole('menuitem', { name: /Style/ }), {
      key: 'ArrowRight',
    });

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'pop' } });
    expect(screen.queryByRole('menuitem', { name: 'Noir' })).toBeNull();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Pop art' }));
    expect(onSetField).toHaveBeenCalledWith('style', 'pop');
  });

  it('can hand a field back to the agent once the user has set it', () => {
    const { onResetField } = renderMenu();
    fireEvent.keyDown(screen.getByRole('menuitem', { name: /Style/ }), {
      key: 'ArrowRight',
    });

    fireEvent.click(screen.getByRole('menuitem', { name: /Reset Style/ }));
    expect(onResetField).toHaveBeenCalledWith('style');
  });

  it('lists Subject and Action as free-text rows and writes what is typed', () => {
    const { onSetField } = renderMenu();
    expect(screen.getByRole('menuitem', { name: /Subject/ })).toBeVisible();

    fireEvent.keyDown(screen.getByRole('menuitem', { name: /Subject/ }), {
      key: 'ArrowRight',
    });
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'a courier' },
    });

    expect(onSetField).toHaveBeenCalledWith('subject', 'a courier');
  });

  it('leaves Subject and Action out when the surface offers no Look', () => {
    renderMenu({});

    expect(screen.queryByRole('menuitem', { name: /Subject/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Action/ })).toBeNull();
  });
});
