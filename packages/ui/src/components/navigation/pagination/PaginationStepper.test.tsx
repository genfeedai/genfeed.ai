import { fireEvent, render, screen } from '@testing-library/react';
import PaginationStepper from '@ui/navigation/pagination/PaginationStepper';
import { describe, expect, it, vi } from 'vitest';

function renderStepper(
  overrides: Partial<Parameters<typeof PaginationStepper>[0]> = {},
) {
  const onNext = vi.fn();
  const onPrevious = vi.fn();
  render(
    <PaginationStepper
      hasNext
      hasPrevious
      nextLabel="Next page"
      onNext={onNext}
      onPrevious={onPrevious}
      previousLabel="Previous page"
      status="Page 2 of 5"
      {...overrides}
    />,
  );
  return { onNext, onPrevious };
}

describe('PaginationStepper', () => {
  it('shows the status and steps in both directions', () => {
    const { onNext, onPrevious } = renderStepper();

    expect(screen.getByText('Page 2 of 5')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrevious).toHaveBeenCalledTimes(1);
  });

  it('disables the ends of the range', () => {
    renderStepper({ hasNext: false, hasPrevious: false });

    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Previous page' }),
    ).toBeDisabled();
  });

  it('disables both buttons while loading', () => {
    renderStepper({ isDisabled: true });

    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Previous page' }),
    ).toBeDisabled();
  });
});
