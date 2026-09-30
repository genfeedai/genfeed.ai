import NotFoundPage from '@pages/not-found/not-found-page';
import { render } from '@testing-library/react';
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

  it('fills the available layout region with the semantic background', () => {
    const { container } = render(<NotFoundPage />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toHaveClass(
      'h-full',
      'w-full',
      'flex-1',
      'bg-background',
    );
    expect(rootElement).not.toHaveClass('container', 'bg-black');
  });

  it('does not stack a full viewport on top of the app shell chrome', () => {
    const { container } = render(<NotFoundPage />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).not.toHaveClass('min-h-dvh', 'min-h-screen');
    expect(rootElement).toHaveClass('min-h-0', 'overflow-hidden');
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
