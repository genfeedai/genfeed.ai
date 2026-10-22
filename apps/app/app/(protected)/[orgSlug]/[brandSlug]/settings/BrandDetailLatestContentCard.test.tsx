import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BrandDetailLatestContentCard from './BrandDetailLatestContentCard';

const props = {
  label: 'Latest content',
  viewAllHref: '/all?type=example',
  emptyTitle: 'Nothing here',
  emptyDescription: 'Create content to begin.',
  createLabel: 'Create content',
  createHref: 'https://app.example.test/create',
};

describe('BrandDetailLatestContentCard', () => {
  it.each([null, undefined])(
    'preserves the empty DOM and primitive link styling for %s children',
    (children) => {
      const { container } = render(
        <BrandDetailLatestContentCard {...props}>
          {children}
        </BrandDetailLatestContentCard>,
      );
      expect(
        screen.getByRole('heading', { name: 'Latest content' }).tagName,
      ).toBe('H3');
      const viewAll = screen.getByRole('link', { name: 'View all' });
      expect(viewAll).toHaveAttribute('href', '/all?type=example');
      expect(viewAll).toHaveClass(
        'h-8 px-2.5 bg-tertiary border border-border',
      );
      const title = screen.getByText('Nothing here');
      const description = screen.getByText('Create content to begin.');
      expect(title.tagName).toBe('P');
      expect(description.tagName).toBe('P');
      expect(title).toHaveClass('text-sm font-medium text-foreground/70');
      expect(description).toHaveClass(
        'max-w-xs text-xs leading-5 text-muted-foreground',
      );
      const empty = title.parentElement;
      expect(empty).toHaveClass(
        'flex flex-col items-center justify-center gap-1 px-4 py-8 text-center',
      );
      expect(empty?.children).toHaveLength(3);
      const create = screen.getByRole('link', { name: 'Create content' });
      expect(create).toHaveAttribute('href', 'https://app.example.test/create');
      expect(create).toHaveClass(
        'mt-2 h-8 px-2.5 bg-primary text-primary-foreground',
      );
      expect(create.parentElement).toBe(empty);
      expect(viewAll.parentElement?.children).toHaveLength(2);
      expect(empty?.parentElement).toHaveClass('gap-3 p-4');
      expect(empty?.parentElement?.children).toHaveLength(2);
      expect(container.childElementCount).toBe(1);
      expect(container.firstElementChild?.children).toHaveLength(1);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    },
  );

  it('renders the supplied node directly beside the header without an extra body wrapper', () => {
    render(
      <BrandDetailLatestContentCard {...props}>
        <section aria-label="Populated content">
          <span>Original node</span>
        </section>
      </BrandDetailLatestContentCard>,
    );
    const content = screen.getByLabelText('Populated content');
    expect(content.parentElement).toHaveClass('gap-3 p-4');
    expect(content.parentElement?.children).toHaveLength(2);
    expect(content.firstElementChild).toHaveTextContent('Original node');
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      '/all?type=example',
    );
    expect(screen.queryByText('Nothing here')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Create content to begin.'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Create content' }),
    ).not.toBeInTheDocument();
  });
});
