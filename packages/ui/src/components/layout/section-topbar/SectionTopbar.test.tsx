import { render, screen } from '@testing-library/react';
import SectionTopbar from '@ui/layout/section-topbar/SectionTopbar';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const navigationState = vi.hoisted(() => ({
  hasCanonicalBreadcrumb: false,
}));

vi.mock('@genfeedai/contexts/ui/sidebar-navigation-context', () => ({
  useSidebarNavigation: () => navigationState,
}));

describe('SectionTopbar', () => {
  beforeEach(() => {
    navigationState.hasCanonicalBreadcrumb = false;
  });

  it('renders a full-bleed bar whose bottom border meets the shell edges', () => {
    render(<SectionTopbar title="Trending Content" />);

    const topbar = screen.getByTestId('section-topbar');

    // The section topbar contract (from Studio's AssetControlsHeader):
    // full width, tokenized bottom border, no outer margins or max-width cap.
    expect(topbar).toHaveClass('w-full', 'border-b', 'border-border');
    expect(topbar.className).not.toMatch(/\bm[xytblr]?-/);
    expect(topbar.className).not.toMatch(/max-w-/);
  });

  it('renders the title as the page h1', () => {
    render(<SectionTopbar title="Trending Content" />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Trending Content' }),
    ).toBeInTheDocument();
  });

  it('renders subtitle and actions inside the title row', () => {
    render(
      <SectionTopbar
        title="Trending Content"
        subtitle="Actual posts and videos trending across platforms."
        actions={<button type="button">Refresh</button>}
      />,
    );

    expect(
      screen.getByText('Actual posts and videos trending across platforms.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('section-topbar-actions')).toContainElement(
      screen.getByRole('button', { name: 'Refresh' }),
    );
  });

  it('renders tabs inside the bordered bar rather than as a detached block', () => {
    render(
      <SectionTopbar
        title="Trending Content"
        tabs={<div data-testid="tabs-strip">tabs</div>}
      />,
    );

    const topbar = screen.getByTestId('section-topbar');
    const tabsSlot = screen.getByTestId('section-topbar-tabs');

    expect(topbar).toContainElement(tabsSlot);
    expect(tabsSlot).toContainElement(screen.getByTestId('tabs-strip'));
    expect(tabsSlot.className).not.toMatch(/\bmb-\d/);
  });

  it('omits the actions and tabs slots when not provided', () => {
    render(<SectionTopbar title="Trending Content" />);

    expect(
      screen.queryByTestId('section-topbar-actions'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('section-topbar-tabs')).not.toBeInTheDocument();
  });

  it('defers its visible title and subtitle to a canonical breadcrumb', () => {
    navigationState.hasCanonicalBreadcrumb = true;

    render(
      <SectionTopbar
        title="Trending Content"
        subtitle="Actual posts and videos trending across platforms."
        actions={<button type="button">Refresh</button>}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Trending Content' }),
    ).toHaveClass('sr-only');
    expect(
      screen.queryByText('Actual posts and videos trending across platforms.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });
});
