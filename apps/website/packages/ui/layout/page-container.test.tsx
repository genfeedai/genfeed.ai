import { render, screen } from '@testing-library/react';
import { PageContainer } from '@ui/layout/page-container';
import { describe, expect, it, vi } from 'vitest';

describe('PageContainer', () => {
  it('renders without crashing', () => {
    render(<PageContainer data-testid="container">Content</PageContainer>);
    expect(screen.getByTestId('container')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(<PageContainer>Page content</PageContainer>);
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('renders as div element', () => {
    render(<PageContainer data-testid="container">Content</PageContainer>);
    expect(screen.getByTestId('container').tagName).toBe('DIV');
  });

  it('has container mx-auto by default', () => {
    render(<PageContainer data-testid="container">Content</PageContainer>);
    const container = screen.getByTestId('container');
    expect(container).toHaveClass('container');
    expect(container).toHaveClass('mx-auto');
  });

  it('applies custom className', () => {
    render(
      <PageContainer className="custom-page" data-testid="container">
        Content
      </PageContainer>,
    );
    expect(screen.getByTestId('container')).toHaveClass('custom-page');
  });

  it('preserves default styles with custom className', () => {
    render(
      <PageContainer className="custom" data-testid="container">
        Content
      </PageContainer>,
    );
    const container = screen.getByTestId('container');
    expect(container).toHaveClass('custom');
    expect(container).toHaveClass('container');
    expect(container).toHaveClass('mx-auto');
  });

  describe('padding variants', () => {
    it('applies default padding (px-6)', () => {
      render(<PageContainer data-testid="container">Content</PageContainer>);
      expect(screen.getByTestId('container')).toHaveClass('px-6');
    });

    it('applies sm padding (px-4)', () => {
      render(
        <PageContainer padding="sm" data-testid="container">
          Content
        </PageContainer>,
      );
      expect(screen.getByTestId('container')).toHaveClass('px-4');
    });

    it('applies lg padding (px-8)', () => {
      render(
        <PageContainer padding="lg" data-testid="container">
          Content
        </PageContainer>,
      );
      expect(screen.getByTestId('container')).toHaveClass('px-8');
    });

    it('applies no padding (px-0)', () => {
      render(
        <PageContainer padding="none" data-testid="container">
          Content
        </PageContainer>,
      );
      expect(screen.getByTestId('container')).toHaveClass('px-0');
    });

    it('applies responsive padding', () => {
      render(
        <PageContainer padding="responsive" data-testid="container">
          Content
        </PageContainer>,
      );
      const container = screen.getByTestId('container');
      expect(container).toHaveClass('px-4');
    });
  });

  describe('HTML attributes', () => {
    it('forwards id attribute', () => {
      render(<PageContainer id="main-content">Content</PageContainer>);
      expect(document.getElementById('main-content')).toBeInTheDocument();
    });

    it('forwards data attributes', () => {
      render(
        <PageContainer data-testid="page-container">Content</PageContainer>,
      );
      expect(screen.getByTestId('page-container')).toBeInTheDocument();
    });

    it('forwards aria attributes', () => {
      render(
        <PageContainer aria-label="Main page content">Content</PageContainer>,
      );
      expect(screen.getByLabelText('Main page content')).toBeInTheDocument();
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref to div element', () => {
      const ref = vi.fn();
      render(<PageContainer ref={ref}>Content</PageContainer>);
      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe('use cases', () => {
    it('can contain complex page content', () => {
      render(
        <PageContainer>
          <header>
            <h1>Page Title</h1>
          </header>
          <main>
            <p>Main content</p>
          </main>
          <footer>Footer</footer>
        </PageContainer>,
      );
      expect(screen.getByText('Page Title')).toBeInTheDocument();
      expect(screen.getByText('Main content')).toBeInTheDocument();
      expect(screen.getByText('Footer')).toBeInTheDocument();
    });

    it('can be used as main layout wrapper', () => {
      render(
        <PageContainer padding="lg" className="py-8">
          <div>Dashboard</div>
        </PageContainer>,
      );
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });
});
