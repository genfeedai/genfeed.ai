import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GenerationSetupOptionPicker from '@ui/dropdowns/generation-setup/GenerationSetupOptionPicker';
import { useState } from 'react';
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

function ControlledPicker() {
  const [value, setValue] = useState('cinema');
  return (
    <GenerationSetupOptionPicker
      label="Style"
      value={value}
      onValueChange={setValue}
      options={[
        { value: 'cinema', label: 'Cinematic' },
        { value: 'anime', label: 'Anime', isPlatformDefault: true },
      ]}
    />
  );
}

describe('GenerationSetupOptionPicker', () => {
  it('searches one field, selects with the keyboard, and replaces the trigger value', async () => {
    const user = userEvent.setup();
    render(<ControlledPicker />);
    await user.click(screen.getByRole('combobox', { name: 'Style' }));
    const search = screen.getByRole('combobox', { name: 'Search style' });
    await user.type(search, 'anime');
    expect(
      screen.queryByRole('option', { name: 'Cinematic' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Anime/ })).toHaveTextContent(
      'Default',
    );
    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByRole('combobox', { name: 'Style' })).toHaveTextContent(
      'Anime',
    );
    expect(
      screen.queryByRole('combobox', { name: 'Search style' }),
    ).not.toBeInTheDocument();
  });
});
