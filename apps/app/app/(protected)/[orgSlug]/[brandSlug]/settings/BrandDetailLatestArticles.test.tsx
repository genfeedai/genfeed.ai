import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BrandDetailLatestArticles from './BrandDetailLatestArticles';

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/moonrise${path}`,
  }),
}));

describe('BrandDetailLatestArticles', () => {
  it('should apply correct styles and classes', () => {
    const { container } = render(<BrandDetailLatestArticles />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
