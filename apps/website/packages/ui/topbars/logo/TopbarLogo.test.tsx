import { render } from '@testing-library/react';
import TopbarLogo from '@ui/topbars/logo/TopbarLogo';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/ui/use-theme-logo/use-theme-logo', () => ({
  useThemeLogo: () => '/logo.png',
}));

describe('TopbarLogo', () => {
  it('should render without crashing', () => {
    const { container } = render(<TopbarLogo logoHref="/dashboard" />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should render a link to the provided href', () => {
    const { container } = render(<TopbarLogo logoHref="/dashboard" />);
    const link = container.querySelector('a');
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('should render the logo image', () => {
    const { container } = render(<TopbarLogo logoHref="/dashboard" />);
    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('alt');
  });
});
