import { ComponentSize } from '@genfeedai/enums';
import { render, screen } from '@testing-library/react';
import Spinner from '@ui/feedback/spinner/Spinner';
import { describe, expect, it } from 'vitest';

type SpinnerSize =
  | ComponentSize.XS
  | ComponentSize.SM
  | ComponentSize.MD
  | ComponentSize.LG;

describe('Spinner', () => {
  it('renders spinner with default props', () => {
    render(<Spinner />);

    const spinner = screen.getByRole('status');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveAttribute('aria-label', 'Loading');
    expect(spinner).toHaveClass('animate-spin');
  });

  it('renders with custom size', () => {
    render(<Spinner size={ComponentSize.LG} />);

    const spinner = screen.getByRole('status');
    expect(spinner).toHaveClass('size-6');
  });

  it('renders with custom className', () => {
    render(<Spinner className="custom-spinner" />);

    const spinner = screen.getByRole('status');
    expect(spinner).toHaveClass('custom-spinner');
  });

  it('renders with both size and custom className', () => {
    render(<Spinner size={ComponentSize.SM} className="my-spinner" />);

    const spinner = screen.getByRole('status');
    expect(spinner).toHaveClass('size-4', 'my-spinner');
  });

  it('handles undefined props gracefully', () => {
    render(<Spinner size={undefined} className={undefined} />);

    const spinner = screen.getByRole('status');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveClass('animate-spin');
  });

  it('handles empty string className', () => {
    render(<Spinner className="" />);

    const spinner = screen.getByRole('status');
    expect(spinner).toHaveClass('animate-spin');
  });

  it('renders with different size variants', () => {
    const sizeToClass: Record<SpinnerSize, string[]> = {
      [ComponentSize.XS]: ['size-3'],
      [ComponentSize.SM]: ['size-4'],
      [ComponentSize.MD]: ['size-5'],
      [ComponentSize.LG]: ['size-6'],
    };

    const sizes: SpinnerSize[] = [
      ComponentSize.XS,
      ComponentSize.SM,
      ComponentSize.MD,
      ComponentSize.LG,
    ];

    sizes.forEach((size) => {
      const { unmount } = render(<Spinner size={size} />);
      const spinner = screen.getByRole('status');
      expect(spinner).toHaveClass(...sizeToClass[size]);
      unmount();
    });
  });

  it('has correct accessibility attributes', () => {
    render(<Spinner />);

    const spinner = screen.getByRole('status');
    expect(spinner).toHaveAttribute('aria-label', 'Loading');
    expect(spinner.tagName).toBe('OUTPUT');
  });

  it('trims whitespace in className', () => {
    render(<Spinner className="  extra-spaces  " />);

    const spinner = screen.getByRole('status');
    expect(spinner).toHaveClass('extra-spaces');
  });
});
