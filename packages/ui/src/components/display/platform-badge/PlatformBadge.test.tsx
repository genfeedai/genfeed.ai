import { ComponentSize } from '@genfeedai/enums';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';

describe('PlatformBadge', () => {
  it('should render without crashing', () => {
    const { container } = render(<PlatformBadge />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders a dash for an unknown or missing platform', () => {
    const { rerender } = render(<PlatformBadge platform="not-a-platform" />);
    expect(screen.getByText('-')).toBeInTheDocument();

    rerender(<PlatformBadge />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('maps twitter and x to the same X label', () => {
    const { rerender } = render(<PlatformBadge platform="twitter" />);
    expect(screen.getByText('X')).toBeInTheDocument();

    rerender(<PlatformBadge platform="X" />);
    expect(screen.getByText('X')).toBeInTheDocument();
  });

  it('hides the label when showLabel is false', () => {
    render(<PlatformBadge platform="instagram" showLabel={false} />);
    expect(screen.queryByText('Instagram')).not.toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { rerender } = render(
      <PlatformBadge platform="youtube" size={ComponentSize.SM} />,
    );
    expect(screen.getByText('YouTube').parentElement).toHaveClass(
      'px-1.5',
      'text-red-500',
    );

    rerender(<PlatformBadge platform="linkedin" className="ml-2" />);
    expect(screen.getByText('LinkedIn').parentElement).toHaveClass('ml-2');
  });
});
