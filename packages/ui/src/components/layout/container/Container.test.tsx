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

  it('keeps full-pane header dividers while insetting header and body content', () => {
    const { container } = render(
      <Container label="Dashboard">content</Container>,
    );
    const rootElement = container.firstChild as HTMLElement;
    const header = rootElement.querySelector('.border-b') as HTMLElement;
    const body = rootElement.lastElementChild as HTMLElement;

    expect(rootElement).not.toHaveClass('px-5');
    expect(header).toHaveClass('px-5');
    expect(header).toHaveClass('sm:px-6');
    expect(header).toHaveClass('lg:px-6');
    expect(body).toHaveClass('px-5');
    expect(body).toHaveClass('sm:px-6');
    expect(body).toHaveClass('lg:px-6');
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
    expect(rootElement.querySelector('.border-b')).not.toBeInTheDocument();
    expect(rootElement.lastElementChild).toHaveClass('px-5');
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

  it('renders header tabs alongside header actions', () => {
    render(
      <Container
        label="Test"
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

    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });
});
