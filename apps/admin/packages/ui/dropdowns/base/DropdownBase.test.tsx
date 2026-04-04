import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DropdownBase from '@ui/dropdowns/base/DropdownBase';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('DropdownBase', () => {
  const originalInnerWidth = window.innerWidth;
  const getBoundingClientRectMock = vi.fn(() => ({
    bottom: 48,
    height: 40,
    left: 24,
    right: 124,
    toJSON: () => ({}),
    top: 8,
    width: 100,
    x: 24,
    y: 8,
  }));

  beforeEach(() => {
    window.innerWidth = 1280;
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: getBoundingClientRectMock,
    });
  });

  afterEach(() => {
    window.innerWidth = originalInnerWidth;
    getBoundingClientRectMock.mockReset();
  });

  it('renders an accessible trigger in auto mode when given a non-element trigger', () => {
    render(
      <DropdownBase trigger="More actions">
        <div>Menu content</div>
      </DropdownBase>,
    );

    expect(
      screen.getByRole('button', { name: 'More actions' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('supports keyboard activation in manual portal mode', async () => {
    const user = userEvent.setup();

    render(
      <DropdownBase
        position="top-full"
        trigger={<button type="button">Manual menu</button>}
      >
        <div>Manual content</div>
      </DropdownBase>,
    );

    const trigger = screen.getByRole('button', { name: 'Manual menu' });
    trigger.focus();
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Manual content')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByText('Manual content')).not.toBeInTheDocument();
    });
  });

  it('repositions the manual portal on resize and scroll', async () => {
    const rect = {
      bottom: 64,
      height: 40,
      left: 16,
      right: 116,
      toJSON: () => ({}),
      top: 24,
      width: 100,
      x: 16,
      y: 24,
    };

    getBoundingClientRectMock.mockImplementation(() => rect);

    render(
      <DropdownBase
        isOpen={true}
        onOpenChange={vi.fn()}
        position="top-full"
        trigger={<button type="button">Pinned menu</button>}
      >
        <div>Reposition target</div>
      </DropdownBase>,
    );

    const portal = await screen.findByText('Reposition target');
    const dropdown = portal.parentElement as HTMLElement;

    await waitFor(() => {
      expect(dropdown.style.left).toBe('16px');
      expect(dropdown.style.top).toBe('72px');
    });

    rect.left = 80;
    rect.right = 180;
    rect.top = 120;
    rect.bottom = 160;

    fireEvent(window, new Event('resize'));
    fireEvent(window, new Event('scroll'));

    await waitFor(() => {
      expect(dropdown.style.left).toBe('80px');
      expect(dropdown.style.top).toBe('168px');
    });
  });
});
