import { fireEvent, render, screen } from '@testing-library/react';
import AppLink from '@ui/navigation/link/Link';
import { describe, expect, it, vi } from 'vitest';

describe('AppLink', () => {
  it('renders with label', () => {
    render(<AppLink url="/dashboard" label="Go to Dashboard" />);
    expect(screen.getByText('Go to Dashboard')).toBeInTheDocument();
  });

  it('renders with correct href', () => {
    render(<AppLink url="/dashboard" label="Go to Dashboard" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('applies custom className', () => {
    render(
      <AppLink
        url="/dashboard"
        label="Go to Dashboard"
        className="custom-class"
      />,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveClass('custom-class');
  });

  it('has default secondary styling classes', () => {
    render(<AppLink url="/dashboard" label="Go to Dashboard" />);
    const link = screen.getByRole('link');
    // Component uses CVA buttonVariants with SECONDARY variant
    expect(link).toHaveClass('inline-flex', 'items-center');
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(
      <AppLink
        url="/dashboard"
        label="Go to Dashboard"
        onClick={handleClick}
      />,
    );

    const link = screen.getByRole('link');
    fireEvent.click(link);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('prevents navigation when isLoading is true', () => {
    const handleClick = vi.fn();
    render(
      <AppLink
        url="/dashboard"
        label="Go to Dashboard"
        isLoading={true}
        onClick={handleClick}
      />,
    );

    const link = screen.getByRole('link');
    fireEvent.click(link);

    // When loading, onClick should NOT be called because preventDefault is called
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('allows navigation when isLoading is false', () => {
    const handleClick = vi.fn();
    render(
      <AppLink
        url="/dashboard"
        label="Go to Dashboard"
        isLoading={false}
        onClick={handleClick}
      />,
    );

    fireEvent.click(screen.getByRole('link'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick callback when clicked', () => {
    const handleClick = vi.fn();
    render(
      <AppLink
        url="/dashboard"
        label="Go to Dashboard"
        onClick={handleClick}
      />,
    );

    fireEvent.click(screen.getByRole('link'));
    expect(handleClick).toHaveBeenCalled();
  });
});
