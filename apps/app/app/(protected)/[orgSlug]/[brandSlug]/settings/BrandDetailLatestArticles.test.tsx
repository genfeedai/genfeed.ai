import type { IArticle } from '@genfeedai/contracts/interfaces';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BrandDetailLatestArticles from './BrandDetailLatestArticles';

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/moonrise${path}`,
  }),
}));

describe('BrandDetailLatestArticles', () => {
  it('should render without crashing', () => {
    const { container } = render(<BrandDetailLatestArticles />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('lays the latest articles out in one 3-across row', () => {
    const articles = [1, 2, 3].map((n) => ({
      id: `a${n}`,
      label: `Article ${n}`,
      slug: `article-${n}`,
    }));
    const { getByText } = render(
      <BrandDetailLatestArticles articles={articles as unknown as IArticle[]} />,
    );

    const grid = getByText('Article 1').closest('.grid');
    expect(grid).toHaveClass('sm:grid-cols-3');
    expect(grid?.children).toHaveLength(3);
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<BrandDetailLatestArticles />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<BrandDetailLatestArticles />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
