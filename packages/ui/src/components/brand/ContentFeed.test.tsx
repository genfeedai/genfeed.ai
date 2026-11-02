import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import ContentFeed from './ContentFeed';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

type MockImageProps = ComponentProps<'img'> & {
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
};

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    priority: _priority,
    unoptimized: _unoptimized,
    ...props
  }: MockImageProps) => <img {...props} alt={props.alt ?? ''} />,
}));

describe('ContentFeed', () => {
  it('shows each post on its own platform with the brand as author', () => {
    render(
      <ContentFeed
        authorHandle="acme"
        authorName="Acme Invoices"
        items={[
          {
            id: 'item-1',
            media: [],
            platform: 'twitter',
            text: 'Invoices should take a minute.',
          },
          {
            id: 'item-2',
            media: [{ kind: 'image', url: 'https://cdn.example/ig.png' }],
            platform: 'instagram',
            text: 'Send your next one in 60 seconds.',
          },
        ]}
        statusLabel="Preview"
      />,
    );

    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByText('Invoices should take a minute.')).toBeVisible();
    expect(
      screen.getByText('Send your next one in 60 seconds.', { exact: false }),
    ).toBeVisible();
    expect(screen.getAllByText('Acme Invoices').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Preview')).toHaveLength(2);
  });

  it('shows the empty message when the brand has no posts', () => {
    render(
      <ContentFeed
        authorName="Acme Invoices"
        emptyMessage="Nothing to show yet."
        items={[]}
      />,
    );

    expect(screen.getByText('Nothing to show yet.')).toBeVisible();
    expect(screen.queryByRole('article')).toBeNull();
  });
});
