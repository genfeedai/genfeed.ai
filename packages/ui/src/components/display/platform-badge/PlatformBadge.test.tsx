import { ComponentSize } from '@genfeedai/contracts';
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
    const { container } = render(
      <PlatformBadge platform="instagram" showLabel={false} />,
    );
    expect(screen.getByText('Instagram')).toHaveClass('sr-only');
    expect(container.firstElementChild).not.toHaveAttribute('aria-label');
  });

  it('should apply correct styles and classes', () => {
    const { rerender } = render(
      <PlatformBadge platform="youtube" size={ComponentSize.SM} />,
    );
    expect(screen.getByText('YouTube').parentElement).toHaveClass(
      'px-1.5',
      'text-foreground',
    );

    rerender(<PlatformBadge platform="linkedin" className="ml-2" />);
    expect(screen.getByText('LinkedIn').parentElement).toHaveClass('ml-2');
  });

  it.each([
    ['beehiiv', 'bg-platform-beehiiv/10', 'text-platform-beehiiv'],
    ['instagram', 'bg-platform-instagram/10', 'text-platform-instagram'],
    ['linkedin', 'bg-platform-linkedin/10', 'text-platform-linkedin'],
    ['youtube', 'bg-platform-youtube/10', 'text-platform-youtube'],
  ])('uses guarded platform tokens for %s', (platform, bgClass, iconClass) => {
    render(<PlatformBadge platform={platform} />);

    const badge = screen.getByText(/.+/).parentElement;
    expect(badge).toHaveClass(bgClass, 'text-foreground');
    expect(badge?.querySelector('svg')).toHaveClass(iconClass);
    expect(badge?.className).not.toMatch(
      /(?:amber|blue|emerald|green|indigo|orange|pink|red|sky|violet|yellow)-\d{2,3}/,
    );
  });

  it.each(['devto', 'ghost', 'threads'])(
    'keeps the near-black %s identity legible on the dark canvas',
    (platform) => {
      render(<PlatformBadge platform={platform} />);

      expect(screen.getByText(/.+/).parentElement).toHaveClass(
        'bg-foreground/10',
      );
    },
  );
});
