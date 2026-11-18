import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import ClipperAvatarQualitySelect from './ClipperAvatarQualitySelect';

describe('ClipperAvatarQualitySelect', () => {
  beforeAll(() => {
    // Radix Select reads pointer capture and scroll APIs jsdom lacks.
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => undefined;
    Element.prototype.releasePointerCapture = () => undefined;
    Element.prototype.scrollIntoView = () => undefined;
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
