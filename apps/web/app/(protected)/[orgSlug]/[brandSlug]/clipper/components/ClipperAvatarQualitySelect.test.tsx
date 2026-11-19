import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import ClipperAvatarQualitySelect from './ClipperAvatarQualitySelect';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('ClipperAvatarQualitySelect', () => {
  const shimmed = [
    'hasPointerCapture',
    'setPointerCapture',
    'releasePointerCapture',
    'scrollIntoView',
  ] as const;
  const originals = new Map<string, PropertyDescriptor | undefined>();

  beforeAll(() => {
    // Radix Select reads pointer capture and scroll APIs jsdom lacks.
    for (const name of shimmed) {
      originals.set(
        name,
        Object.getOwnPropertyDescriptor(Element.prototype, name),
      );
      Object.defineProperty(Element.prototype, name, {
        configurable: true,
        value: name === 'hasPointerCapture' ? () => false : () => undefined,
        writable: true,
      });
    }
  });

  afterAll(() => {
    for (const name of shimmed) {
      const original = originals.get(name);
      if (original) Object.defineProperty(Element.prototype, name, original);
      else Reflect.deleteProperty(Element.prototype, name);
    }
  });

  it('shows the chosen quality and what it costs more of', () => {
    render(
      <ClipperAvatarQualitySelect onQualityChange={vi.fn()} quality="high" />,
    );

    expect(screen.getByRole('combobox')).toHaveTextContent(
      'High (Avatar 6, 2K)',
    );
    expect(
      screen.getByText(/higher quality costs more credits per second/i),
    ).toBeInTheDocument();
  });

  it.each([
    ['Draft (Avatar IV)', 'draft'],
    ['Low (Avatar 6 Turbo, 1080p)', 'low'],
    ['Medium (Avatar 6, 1080p)', 'medium'],
    ['High (Avatar 6, 2K)', 'high'],
  ])('picks %s', async (name, expected) => {
    const onQualityChange = vi.fn();
    render(
      <ClipperAvatarQualitySelect
        onQualityChange={onQualityChange}
        quality="auto"
      />,
    );

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name }));

    expect(onQualityChange).toHaveBeenCalledWith(expected);
  });
});
