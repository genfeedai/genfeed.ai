import { fireEvent, render, screen } from '@testing-library/react';
import { track } from '@vercel/analytics';
import { describe, expect, it, vi } from 'vitest';
import ButtonRequestAccess from './ButtonRequestAccess';

vi.mock('@vercel/analytics', () => ({
  track: vi.fn(),
}));

describe('ButtonRequestAccess', () => {
  it('uses the canonical marketing bridge for request-access clicks', () => {
    const listener = vi.fn();
    window.addEventListener('genfeed:marketing:button-click', listener);

    render(<ButtonRequestAccess />);

    fireEvent.click(screen.getByRole('link', { name: /book a call/i }));

    expect(track).toHaveBeenCalledWith('request_access_click', {
      action: 'book_call_request_access',
      label: 'Book a Call',
    });
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
