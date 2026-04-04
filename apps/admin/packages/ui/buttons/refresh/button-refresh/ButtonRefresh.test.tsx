import { fireEvent, render, screen } from '@testing-library/react';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import { describe, expect, it, vi } from 'vitest';

describe('ButtonRefresh', () => {
  it('renders an icon-only button with an accessible name', () => {
    render(<ButtonRefresh onClick={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
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
});
