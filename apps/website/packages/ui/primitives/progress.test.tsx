import { render, screen } from '@testing-library/react';
import { Progress } from '@ui/primitives/progress';
import { describe, expect, it, vi } from 'vitest';

describe('Progress', () => {
  it('renders without crashing', () => {
    render(<Progress />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('has progressbar role', () => {
    render(<Progress />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders with value prop', () => {
    const { container } = render(<Progress value={50} />);
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toBeInTheDocument();
    // Indicator transforms to show progress percentage
    const indicator = container.querySelector('[style]');
    expect(indicator).toBeInTheDocument();
  });

  it('renders with 0 value', () => {
    const { container } = render(<Progress value={0} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    // Empty progress
    const indicator = container.querySelector('[style]');
    expect(indicator).toHaveStyle({ transform: 'translateX(-100%)' });
  });

  it('renders with 100 value (complete)', () => {
    const { container } = render(<Progress value={100} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    const indicator = container.querySelector('[style]');
    expect(indicator).toHaveStyle({ transform: 'translateX(-0%)' });
  });

  it('applies custom className', () => {
    render(<Progress className="custom-progress" />);
    expect(screen.getByRole('progressbar')).toHaveClass('custom-progress');
  });

  it('preserves default styles', () => {
    render(<Progress />);
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveClass('relative');
    expect(progressbar).toHaveClass('h-2');
    expect(progressbar).toHaveClass('w-full');
    expect(progressbar).toHaveClass('overflow-hidden');
    expect(progressbar).toHaveClass('rounded-full');
  });

  it('has aria-valuemin of 0', () => {
    render(<Progress />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuemin',
      '0',
    );
  });

  it('has aria-valuemax of 100', () => {
    render(<Progress />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuemax',
      '100',
    );
  });

  describe('indicator', () => {
    it('renders progress indicator', () => {
      const { container } = render(<Progress value={60} />);
      const indicator = container.querySelector('[class*="bg-primary"]');
      expect(indicator).toBeInTheDocument();
    });

    it('indicator has correct transform for 50%', () => {
      const { container } = render(<Progress value={50} />);
      const indicator = container.querySelector('[style]');
      expect(indicator).toHaveStyle({ transform: 'translateX(-50%)' });
    });

    it('indicator has correct transform for 100%', () => {
      const { container } = render(<Progress value={100} />);
      const indicator = container.querySelector('[style]');
      expect(indicator).toHaveStyle({ transform: 'translateX(-0%)' });
    });

    it('indicator has correct transform for 0%', () => {
      const { container } = render(<Progress value={0} />);
      const indicator = container.querySelector('[style]');
      expect(indicator).toHaveStyle({ transform: 'translateX(-100%)' });
    });

    it('indicator defaults to 0% when value is null/undefined', () => {
      const { container } = render(<Progress />);
      const indicator = container.querySelector('[style]');
      expect(indicator).toHaveStyle({ transform: 'translateX(-100%)' });
    });

    it('indicator has transition', () => {
      const { container } = render(<Progress value={50} />);
      const indicator = container.querySelector('[class*="transition-all"]');
      expect(indicator).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has correct aria attributes', () => {
      render(<Progress value={75} />);
      const progressbar = screen.getByRole('progressbar');
      // Radix Progress sets aria range attributes
      expect(progressbar).toHaveAttribute('aria-valuemin', '0');
      expect(progressbar).toHaveAttribute('aria-valuemax', '100');
    });

    it('supports aria-label', () => {
      render(<Progress value={50} aria-label="Upload progress" />);
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-label',
        'Upload progress',
      );
    });

    it('supports aria-labelledby', () => {
      render(
        <div>
          <span id="progress-label">Loading...</span>
          <Progress value={50} aria-labelledby="progress-label" />
        </div>,
      );
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-labelledby',
        'progress-label',
      );
    });

    it('supports aria-describedby', () => {
      render(<Progress value={50} aria-describedby="progress-description" />);
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-describedby',
        'progress-description',
      );
    });
  });

  describe('HTML attributes', () => {
    it('forwards id attribute', () => {
      render(<Progress id="file-progress" />);
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'id',
        'file-progress',
      );
    });

    it('forwards data attributes', () => {
      render(<Progress data-testid="custom-progress" />);
      expect(screen.getByTestId('custom-progress')).toBeInTheDocument();
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref to progressbar element', () => {
      const ref = vi.fn();
      render(<Progress ref={ref} />);
      expect(ref).toHaveBeenCalled();
    });
  });

  describe('value ranges', () => {
    it('handles 25% value', () => {
      const { container } = render(<Progress value={25} />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      const indicator = container.querySelector('[style]');
      expect(indicator).toHaveStyle({ transform: 'translateX(-75%)' });
    });

    it('handles 75% value', () => {
      const { container } = render(<Progress value={75} />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      const indicator = container.querySelector('[style]');
      expect(indicator).toHaveStyle({ transform: 'translateX(-25%)' });
    });

    it('handles decimal values', () => {
      render(<Progress value={33.33} />);
      // Radix rounds/accepts the value
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });
});
