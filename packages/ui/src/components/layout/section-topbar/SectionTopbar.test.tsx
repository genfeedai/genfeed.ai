import { fireEvent, render, screen } from '@testing-library/react';
import SectionTopbar from '@ui/layout/section-topbar/SectionTopbar';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const navigationState = vi.hoisted(() => ({
  hasCanonicalBreadcrumb: false,
}));

vi.mock('@genfeedai/contexts/ui/sidebar-navigation-context', () => ({
  useSidebarNavigation: () => navigationState,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../apps/app/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

describe('SectionTopbar', () => {
  it('keeps semantic back navigation out of the tab slot', () => {
    render(
      <SectionTopbar
        leading={<a href="/library">Back to library</a>}
        title="Editor"
        titleVisibility="sr-only"
      />,
    );

    expect(screen.getByTestId('section-topbar-leading')).toContainElement(
      screen.getByRole('link', { name: 'Back to library' }),
    );
    expect(screen.queryByTestId('section-topbar-tabs')).not.toBeInTheDocument();
  });

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
    expect(screen.getByTestId('section-topbar-actions')).toHaveClass(
      'max-w-full',
      'flex-wrap',
    );
  });

  it('keeps action-only chrome inside the available width', () => {
    render(
      <SectionTopbar
        title="Content"
        titleVisibility="sr-only"
        actions={<div className="min-w-[60rem]">Filters</div>}
      />,
    );

    expect(screen.getByTestId('section-topbar-actions')).toHaveClass(
      'min-w-0',
      'flex-1',
      'flex-wrap',
      'justify-start',
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

  it('places tabs after actions at the far right when the breadcrumb owns the title', () => {
    navigationState.hasCanonicalBreadcrumb = true;

    render(
      <SectionTopbar
        title="Trending Content"
        actions={<button type="button">Refresh</button>}
        tabs={<div data-testid="tabs-strip">tabs</div>}
      />,
    );

    const actions = screen.getByTestId('section-topbar-actions');
    const tabs = screen.getByTestId('section-topbar-tabs');
    const row = actions.parentElement;

    expect(row).toContainElement(tabs);
    expect(row).toContainElement(actions);
    expect(tabs).toHaveClass('min-w-0');
    expect(actions).toHaveClass('shrink-0');
    // Tabs follow actions in visual and keyboard order.
    expect(row?.lastElementChild).toBe(tabs);
  });

  it('honors titleVisibility=sr-only even without a breadcrumb', () => {
    render(
      <SectionTopbar
        title="Posts"
        titleVisibility="sr-only"
        actions={<button type="button">Refresh</button>}
        tabs={<div data-testid="tabs-strip">tabs</div>}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Posts' })).toHaveClass(
      'sr-only',
    );
    const actions = screen.getByTestId('section-topbar-actions');
    const tabs = screen.getByTestId('section-topbar-tabs');
    expect(actions.parentElement).toContainElement(tabs);
  });

  it('does not reserve an empty border strip when only an sr-only title remains', () => {
    navigationState.hasCanonicalBreadcrumb = true;

    render(<SectionTopbar title="Library" />);

    const topbar = screen.getByTestId('section-topbar');
    expect(topbar.tagName).toBe('H1');
    expect(topbar).toHaveClass('sr-only');
    expect(topbar.className).not.toMatch(/border-b/);
  });

  it('renders a help trigger before actions that opens a popover with the given title and body', () => {
    render(
      <SectionTopbar
        title="Trending Content"
        actions={<button type="button">Refresh</button>}
        help={{ title: 'About Trending', body: 'How this page works.' }}
      />,
    );

    const actionsSlot = screen.getByTestId('section-topbar-actions');
    const helpTrigger = screen.getByRole('button', {
      name: 'About this page',
    });
    const refresh = screen.getByRole('button', { name: 'Refresh' });
    const helpSlot = screen.getByTestId('section-topbar-help');
    expect(actionsSlot).toContainElement(helpTrigger);
    expect(actionsSlot.firstElementChild).toBe(helpSlot);
    expect(
      helpTrigger.compareDocumentPosition(refresh) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(helpTrigger);

    expect(screen.getByText('About Trending')).toBeInTheDocument();
    expect(screen.getByText('How this page works.')).toBeInTheDocument();
  });

  it('right-aligns Help when it is the only breadcrumb toolbar control', () => {
    navigationState.hasCanonicalBreadcrumb = true;
    render(
      <SectionTopbar
        title="Overview"
        help={{ title: 'About Overview', body: 'Workspace guidance.' }}
      />,
    );

    const helpSlot = screen.getByTestId('section-topbar-help');
    const actionsSlot = screen.getByTestId('section-topbar-actions');
    expect(actionsSlot).toContainElement(helpSlot);
    expect(actionsSlot.firstElementChild).toBe(helpSlot);
    expect(actionsSlot).toHaveClass('shrink-0');
    expect(helpSlot).toHaveClass('shrink-0');
    expect(actionsSlot.parentElement).toHaveClass('justify-end');
    expect(helpSlot).toContainElement(
      screen.getByRole('button', { name: 'About this page' }),
    );
  });

  it('keeps Help immediately left of actions, with tabs after the action cluster', () => {
    navigationState.hasCanonicalBreadcrumb = true;
    render(
      <SectionTopbar
        title="Content"
        actions={<button type="button">Refresh</button>}
        tabs={<a href="/content">All content</a>}
        help={{ title: 'About Content', body: 'Content guidance.' }}
      />,
    );

    const actions = screen.getByTestId('section-topbar-actions');
    const tabs = screen.getByTestId('section-topbar-tabs');
    const helpSlot = screen.getByTestId('section-topbar-help');
    expect(actions).toContainElement(helpSlot);
    expect(actions.firstElementChild).toBe(helpSlot);
    expect(actions.nextElementSibling).toBe(tabs);
    expect(helpSlot.parentElement).toHaveClass('flex', 'items-center', 'gap-2');
  });

  it('omits the help trigger when the help prop is not provided', () => {
    render(<SectionTopbar title="Trending Content" />);

    expect(
      screen.queryByRole('button', { name: 'About this page' }),
    ).not.toBeInTheDocument();
  });
});
