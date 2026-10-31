import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ButtonTracked from './ButtonTracked';

describe('ButtonTracked', () => {
  it('emits the canonical marketing bridge event and forwards onClick', () => {
    const listener = vi.fn();
    const onClick = vi.fn();
    window.addEventListener('genfeed:marketing:button-click', listener);

    render(
      <ButtonTracked
        trackingName="hero_cta_click"
        trackingData={{ action: 'book_demo' }}
        onClick={onClick}
      >
        Book demo
      </ButtonTracked>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Book demo' }));

    expect(onClick).toHaveBeenCalledTimes(1);
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
