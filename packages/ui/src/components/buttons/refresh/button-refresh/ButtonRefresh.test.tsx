import { fireEvent, render, screen } from '@testing-library/react';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import { describe, expect, it, vi } from 'vitest';

describe('ButtonRefresh', () => {
  it('renders an icon-only button with an accessible name', () => {
    render(<ButtonRefresh onClick={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('uses a compact shell icon (size-3.5 inside a size-8 hit target)', () => {
    render(<ButtonRefresh onClick={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Refresh' });
    expect(button.className).toContain('size-8');
    expect(button.className).toContain('[&_svg]:size-3.5');
    expect(button.querySelector('svg')).toHaveClass('size-3.5');
  });

  it('calls onClick when pressed', () => {
    const onClick = vi.fn();

    render(<ButtonRefresh onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps the refresh control interactive while not loading', () => {
    render(<ButtonRefresh onClick={vi.fn()} isRefreshing={false} />);

    expect(screen.getByRole('button', { name: 'Refresh' })).not.toBeDisabled();
  });

  it('swaps the arrows for the shared spinner while refreshing', () => {
    const { rerender } = render(
      <ButtonRefresh onClick={vi.fn()} isRefreshing={false} />,
    );

    const idle = screen.getByRole('button', { name: 'Refresh' });
    expect(idle.querySelector('svg')).toBeTruthy();
    expect(idle.querySelector('output')).toBeNull();

    rerender(<ButtonRefresh onClick={vi.fn()} isRefreshing />);

    const refreshing = screen.getByRole('button', { name: 'Refresh' });
    expect(refreshing.querySelector('svg')).toBeNull();
    expect(refreshing.querySelector('output')).toHaveClass('animate-spin');
  });
});
