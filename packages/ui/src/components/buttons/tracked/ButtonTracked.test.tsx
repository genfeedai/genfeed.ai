import { fireEvent, render, screen } from '@testing-library/react';
import { track } from '@vercel/analytics';
import { describe, expect, it, vi } from 'vitest';
import ButtonTracked from './ButtonTracked';

vi.mock('@vercel/analytics', () => ({
  track: vi.fn(),
}));

describe('ButtonTracked', () => {
  it('emits Vercel analytics and canonical marketing bridge events', () => {
    const listener = vi.fn();
    window.addEventListener('genfeed:marketing:button-click', listener);

    render(
      <ButtonTracked
        trackingName="hero_cta_click"
        trackingData={{ action: 'book_demo' }}
      >
        Book demo
      </ButtonTracked>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Book demo' }));

    expect(track).toHaveBeenCalledWith('hero_cta_click', {
      action: 'book_demo',
    });
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          trackingData: { action: 'book_demo' },
          trackingName: 'hero_cta_click',
        },
      }),
    );

    window.removeEventListener('genfeed:marketing:button-click', listener);
  });
});
