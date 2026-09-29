import { render, screen } from '@testing-library/react';
import TopbarShared from '@ui/topbars/shared/TopbarShared';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/topbars/breadcrumbs/TopbarBreadcrumbs', () => ({
  default: () => <div data-testid="breadcrumbs" />,
}));

vi.mock('@ui/topbars/end/TopbarEnd', () => ({
  default: () => <div data-testid="topbar-end" />,
}));

describe('TopbarShared', () => {
  it('should render child components', () => {
    render(<TopbarShared />);
    expect(screen.getByTestId('breadcrumbs')).toBeInTheDocument();
    expect(screen.getByTestId('topbar-end')).toBeInTheDocument();
  });

  it('keeps brand and organization switchers out of the topbar shell', () => {
    render(<TopbarShared />);

    expect(
      screen.queryByTestId('organization-switcher'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('brand-switcher')).not.toBeInTheDocument();
  });

  it('should render as a header element', () => {
    render(<TopbarShared />);
    const header = screen.getByRole('banner');
    expect(header).toBeInTheDocument();
    expect(header).toHaveClass('size-full', 'bg-transparent');
  });
});
