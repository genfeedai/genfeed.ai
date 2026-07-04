import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ButtonRequestAccess from './ButtonRequestAccess';

describe('ButtonRequestAccess', () => {
  it('uses the canonical marketing bridge for request-access clicks', () => {
    const listener = vi.fn();
    window.addEventListener('genfeed:marketing:button-click', listener);

    render(<ButtonRequestAccess />);

    fireEvent.click(screen.getByRole('link', { name: /book a call/i }));

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          trackingData: {
            action: 'book_call_request_access',
            label: 'Book a Call',
          },
          trackingName: 'request_access_click',
        },
      }),
    );

    window.removeEventListener('genfeed:marketing:button-click', listener);
  });
});
