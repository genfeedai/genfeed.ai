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
  it('should render without crashing', () => {
    const { container } = render(<TopbarShared />);
    expect(container.firstChild).toBeInTheDocument();
  });

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
    expect(header).toHaveClass('h-full', 'w-full', 'bg-transparent');
  });

  it('uses tighter right padding so inbox sits closer to the agent rail', () => {
    const { container } = render(<TopbarShared />);
    const innerRow = container.querySelector('header > div');

    expect(innerRow).toHaveClass(
      'pl-4',
      'pr-2',
      'sm:pl-6',
      'sm:pr-3',
      'lg:pl-8',
      'lg:pr-2',
    );
  });
});
