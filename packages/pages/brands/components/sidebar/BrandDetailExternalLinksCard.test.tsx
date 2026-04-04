import BrandDetailExternalLinksCard from '@pages/brands/components/sidebar/BrandDetailExternalLinksCard';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('BrandDetailExternalLinksCard', () => {
  it('should render without crashing', () => {
    render(
      <BrandDetailExternalLinksCard links={[]} onOpenLinkModal={vi.fn()} />,
    );
    expect(screen.getByText('External Links')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /add link/i }),
    ).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const onOpenLinkModal = vi.fn();
    render(
      <BrandDetailExternalLinksCard
        links={[]}
        onOpenLinkModal={onOpenLinkModal}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /add link/i }));
    expect(onOpenLinkModal).toHaveBeenCalledWith();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <BrandDetailExternalLinksCard links={[]} onOpenLinkModal={vi.fn()} />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
    expect(rootElement).toHaveClass('card');
  });
});
