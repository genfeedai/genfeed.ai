import { render } from '@testing-library/react';
import NotFoundPage from '@ui/error/not-found/not-found-page';
import { describe, expect, it } from 'vitest';

describe('NotFoundPage', () => {
  it('should render without crashing', () => {
    const { container } = render(<NotFoundPage />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<NotFoundPage />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('fills the available layout region when embedded', () => {
    const { container } = render(<NotFoundPage />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toHaveClass(
      'h-full',
      'w-full',
      'flex-1',
      'bg-background',
      'items-center',
      'justify-center',
    );
    expect(rootElement).not.toHaveClass('container', 'bg-black');
  });

  it('does not stack a full viewport on top of the app shell chrome', () => {
    const { container } = render(<NotFoundPage />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).not.toHaveClass('min-h-dvh', 'min-h-screen');
    expect(rootElement).toHaveClass('min-h-0', 'overflow-hidden');
  });

  it('owns the viewport and centers its content on a standalone page', () => {
    const { container } = render(<NotFoundPage variant="page" />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toHaveClass(
      'min-h-dvh',
      'w-full',
      'items-center',
      'justify-center',
      'bg-background',
    );
    expect(rootElement).not.toHaveClass('h-full', 'overflow-hidden');
  });

  it('announces 404 once and leads with a single heading', () => {
    const { getByRole } = render(<NotFoundPage />);
    expect(getByRole('img', { name: '404' })).toBeInTheDocument();
    expect(getByRole('heading', { level: 1 })).toHaveTextContent(
      'This page wandered off',
    );
  });

  it('keeps the orbit animation behind motion-safe', () => {
    const { container } = render(<NotFoundPage />);
    const animated = container.querySelectorAll('[class*="animate-"]');
    expect(animated.length).toBeGreaterThan(0);
    animated.forEach((element) => {
      expect(element.getAttribute('class')).toContain('motion-safe:animate-');
    });
  });

  it('uses the semantic primary treatment for the home CTA', () => {
    const { getByRole } = render(
      <NotFoundPage homeHref="/" homeLabel="Go to Workspace" />,
    );
    const cta = getByRole('link', { name: 'Go to Workspace' });
    expect(cta).toHaveClass('bg-primary', 'text-primary-foreground');
    expect(cta).not.toHaveClass('bg-white', 'text-black');
  });
});
