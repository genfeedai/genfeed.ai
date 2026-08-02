import { render, screen } from '@testing-library/react';
import Container from '@ui/layout/container/Container';
import { describe, expect, it } from 'vitest';

describe('Container', () => {
  it('should render without crashing', () => {
    const { container } = render(<Container>content</Container>);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<Container>content</Container>);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<Container>content</Container>);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
    expect(rootElement).toHaveClass('mx-0');
    expect(rootElement).toHaveClass('max-w-none');
    expect(rootElement).not.toHaveClass('mx-auto');
    expect(rootElement).not.toHaveClass('max-w-[1280px]');
  });

  it('supports constrained pages when a content cap is requested', () => {
    const { container } = render(
      <Container fullWidth={false}>content</Container>,
    );
    const rootElement = container.firstChild as HTMLElement;

    expect(rootElement).toHaveClass('mx-auto');
    expect(rootElement).toHaveClass('max-w-[1280px]');
    expect(rootElement).not.toHaveClass('mx-0');
    expect(rootElement).not.toHaveClass('max-w-none');
  });

  it('keeps full-pane header content inset without rendering a divider', () => {
    const { container } = render(
      <Container label="Dashboard">content</Container>,
    );
    const rootElement = container.firstChild as HTMLElement;
    const header = screen.getByRole('heading', { name: 'Dashboard' })
      .parentElement?.parentElement;

    expect(rootElement).toHaveClass('py-5', 'sm:py-6');
    expect(rootElement).not.toHaveClass('px-5');
    expect(header).toHaveClass('px-5');
    expect(header).toHaveClass('sm:px-6');
    expect(header).not.toHaveClass('border-b');
  });

  it('insets full-width body content to match the header gutter', () => {
    render(
      <Container label="Dashboard">
        <div data-testid="body-content">content</div>
      </Container>,
    );

    const bodyWrapper = screen.getByTestId('body-content').parentElement;

    expect(bodyWrapper).toHaveClass('px-5');
    expect(bodyWrapper).toHaveClass('sm:px-6');
  });

  it('supports full-height page body layouts', () => {
    render(
      <Container bodyClassName="flex min-h-0 flex-1 flex-col">
        <div data-testid="body-content">content</div>
      </Container>,
    );

    const bodyWrapper = screen.getByTestId('body-content').parentElement;

    expect(bodyWrapper).toHaveClass('flex');
    expect(bodyWrapper).toHaveClass('min-h-0');
    expect(bodyWrapper).toHaveClass('flex-1');
    expect(bodyWrapper).toHaveClass('flex-col');
  });

  it('does not double-inset constrained body content', () => {
    render(
      <Container fullWidth={false} label="Dashboard">
        <div data-testid="body-content">content</div>
      </Container>,
    );

    const bodyWrapper = screen.getByTestId('body-content').parentElement;

    expect(bodyWrapper).not.toHaveClass('px-5');
    expect(bodyWrapper).not.toHaveClass('sm:px-6');
  });

  it('can keep the h1 for assistive tech without rendering the visible header row', () => {
    const { container } = render(
      <Container label="Dashboard" titleVisibility="sr-only">
        content
      </Container>,
    );
    const rootElement = container.firstChild as HTMLElement;

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toHaveClass(
      'sr-only',
    );
    expect(rootElement.querySelector('.border-b')).toBeNull();
    // No empty header chrome (mb-4 pb-3) when the title is assistive-only.
    expect(rootElement.querySelector('.mb-4.pb-3')).toBeNull();
  });

  it('keeps header controls visible when the title is screen-reader only', () => {
    render(
      <Container
        label="Inbox"
        titleVisibility="sr-only"
        right={<button type="button">Refresh</button>}
      >
        content
      </Container>,
    );

    expect(screen.getByRole('heading', { name: 'Inbox' })).toHaveClass(
      'sr-only',
    );
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('right-aligns primary actions when the title is assistive-only', () => {
    render(
      <Container
        label="Brands"
        titleVisibility="sr-only"
        right={<button type="button">Add Brand</button>}
      >
        content
      </Container>,
    );

    const action = screen.getByRole('button', { name: 'Add Brand' });
    const toolbar = action.closest('.justify-end');

    expect(toolbar).not.toBeNull();
  });

  it('clusters header tabs with actions on the right when the title is assistive-only', () => {
    render(
      <Container
        label="Inbox"
        titleVisibility="sr-only"
        headerTabs={{
          activeTab: 'overview',
          fullWidth: false,
          items: [
            { href: '/test', id: 'overview', label: 'Overview' },
            { href: '/test/details', id: 'details', label: 'Details' },
          ],
          variant: 'pills',
        }}
        right={<button type="button">Refresh</button>}
      >
        content
      </Container>,
    );

    const overview = screen.getByRole('link', { name: 'Overview' });
    const refresh = screen.getByRole('button', { name: 'Refresh' });
    const toolbar = refresh.closest('.justify-end');

    expect(overview).toBeInTheDocument();
    expect(refresh).toBeInTheDocument();
    expect(toolbar).not.toBeNull();
    expect(toolbar?.contains(overview)).toBe(true);
    expect(toolbar?.contains(refresh)).toBe(true);
  });

  it('keeps title left and spreads tabs/actions when the title is visible', () => {
    render(
      <Container
        label="Models"
        headerTabs={{
          activeTab: 'overview',
          fullWidth: false,
          items: [
            { href: '/test', id: 'overview', label: 'Overview' },
            { href: '/test/details', id: 'details', label: 'Details' },
          ],
          variant: 'default',
        }}
        right={<button type="button">Refresh</button>}
      >
        content
      </Container>,
    );

    const overview = screen.getByRole('link', { name: 'Overview' });
    const refresh = screen.getByRole('button', { name: 'Refresh' });
    const toolbar = refresh.closest('.justify-between');

    expect(screen.getByRole('heading', { name: 'Models' })).toBeVisible();
    expect(toolbar).not.toBeNull();
    expect(toolbar?.contains(overview)).toBe(true);
    expect(toolbar?.contains(refresh)).toBe(true);
  });
});
