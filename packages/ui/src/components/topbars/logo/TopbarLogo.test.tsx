import { render } from '@testing-library/react';
import TopbarLogo from '@ui/topbars/logo/TopbarLogo';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/hooks/ui/use-theme-logo/use-theme-logo', () => ({
  useThemeLogo: () => '/logo.png',
}));

describe('TopbarLogo', () => {
  it('should render the logo image', () => {
    const { container } = render(<TopbarLogo logoHref="/dashboard" />);
    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('alt');
  });

  it('supports the compact sidebar treatment without changing link semantics', () => {
    const { container } = render(<TopbarLogo logoHref="/" size="compact" />);
    const link = container.querySelector('a');
    const img = container.querySelector('img');

    expect(link).toHaveAttribute('href', '/');
    expect(link).toHaveClass('size-8');
    expect(img).toHaveClass('size-4');
  });
});
