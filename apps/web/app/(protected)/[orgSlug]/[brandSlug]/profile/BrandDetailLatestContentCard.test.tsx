import { render, screen } from '@testing-library/react';
import Link from 'next/link';
import { describe, expect, it } from 'vitest';
import BrandDetailLatestContentCard from './BrandDetailLatestContentCard';

const props = {
  createHref: 'https://app.example.test/create',
  createLabel: 'Create content',
  emptyTitle: 'Nothing here',
  label: 'Latest content',
  viewAllLink: (
    <Link data-caller-link="preserved" href="/all?type=example">
      View all
    </Link>
  ),
};

describe('BrandDetailLatestContentCard', () => {
  it.each([null, undefined])(
    'shows the title, View all and the empty state for %s children',
    (children) => {
      render(
        <BrandDetailLatestContentCard {...props}>
          {children}
        </BrandDetailLatestContentCard>,
      );

      expect(
        screen.getByRole('heading', { name: 'Latest content' }),
      ).toBeVisible();
      const viewAll = screen.getByRole('link', { name: 'View all' });
      expect(viewAll).toHaveAttribute('href', '/all?type=example');
      expect(viewAll).toHaveAttribute('data-caller-link', 'preserved');
      expect(screen.getByText('Nothing here')).toBeVisible();
      expect(
        screen.getByRole('link', { name: 'Create content' }),
      ).toHaveAttribute('href', 'https://app.example.test/create');
    },
  );

  it('keeps the title and View all outside the content, in the same heading row', () => {
    render(
      <BrandDetailLatestContentCard {...props}>
        <section aria-label="Populated content">
          <span>Original node</span>
        </section>
      </BrandDetailLatestContentCard>,
    );

    const content = screen.getByLabelText('Populated content');
    const heading = screen.getByRole('heading', { name: 'Latest content' });
    const viewAll = screen.getByRole('link', { name: 'View all' });
    expect(content).toHaveTextContent('Original node');
    expect(content.contains(heading)).toBe(false);
    expect(content.contains(viewAll)).toBe(false);
    expect(heading.closest('div')?.parentElement).toContainElement(viewAll);
    expect(screen.queryByText('Nothing here')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Create content' }),
    ).not.toBeInTheDocument();
  });
});
