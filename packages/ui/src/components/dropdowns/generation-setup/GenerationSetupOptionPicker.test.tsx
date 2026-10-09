import { fireEvent, render, screen, within } from '@testing-library/react';
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
      previewKind="style"
      label="Style"
      value={value}
      onValueChange={setValue}
      options={[
        {
          value: 'cinema',
          label: 'Cinematic',
          description: 'Film-like framing',
          thumbnailUrl: '/look/cinema.webp',
        },
        { value: 'anime', label: 'Anime', isPlatformDefault: true },
      ]}
    />
  );
}

describe('GenerationSetupOptionPicker', () => {
  it('shows a labelled curated mood image on highlight, and closes on selection', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <GenerationSetupOptionPicker
        previewKind="mood"
        label="Mood"
        value=""
        onValueChange={onValueChange}
        options={[
          { value: 'dreamy', label: 'Dreamy', isPlatformDefault: true },
        ]}
      />,
    );
    await user.click(screen.getByRole('combobox', { name: 'Mood' }));
    await user.hover(screen.getByRole('option', { name: /Dreamy/ }));
    const preview = screen.getByRole('region', { name: 'Mood preview' });
    expect(
      within(preview).getByRole('img', { name: 'Dreamy example' }),
    ).toHaveAttribute('src', '/assets/look-previews/preview-atlas.png');
    expect(preview).toHaveTextContent('Illustrative example');
    expect(onValueChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('option', { name: /Dreamy/ }));
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('dreamy');
    expect(
      screen.queryByRole('region', { name: 'Mood preview' }),
    ).not.toBeInTheDocument();
  });

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
  it('previews hovered and keyboard-highlighted options without committing a selection', async () => {
    const user = userEvent.setup();
    render(<ControlledPicker />);
    await user.click(screen.getByRole('combobox', { name: 'Style' }));
    await user.hover(screen.getByRole('option', { name: 'Cinematic' }));
    const preview = screen.getByRole('region', { name: 'Style preview' });
    expect(
      within(preview).getByRole('img', { name: 'Cinematic example' }),
    ).toHaveAttribute('src', '/look/cinema.webp');
    expect(preview).toHaveTextContent('Film-like framing');
    await user.click(screen.getByRole('combobox', { name: 'Search style' }));
    await user.keyboard('{ArrowDown}');
    expect(preview).toHaveTextContent('Anime');
    expect(preview).toHaveTextContent('Illustrative example');
    expect(screen.getByRole('combobox', { name: 'Style' })).toHaveTextContent(
      'Cinematic',
    );
    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('region', { name: 'Style preview' }),
    ).not.toBeInTheDocument();
  });

  it('handles a broken preview image without losing the option description', async () => {
    const user = userEvent.setup();
    render(<ControlledPicker />);
    await user.click(screen.getByRole('combobox', { name: 'Style' }));
    await user.hover(screen.getByRole('option', { name: 'Cinematic' }));
    fireEvent.error(screen.getByRole('img', { name: 'Cinematic example' }));
    expect(
      screen.getByRole('region', { name: 'Style preview' }),
    ).toHaveTextContent('Film-like framing');
    expect(
      screen.getByRole('region', { name: 'Style preview' }),
    ).toHaveTextContent('No example image saved');
  });
});
