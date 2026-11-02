import { LinkCategory } from '@genfeedai/contracts';
import type { BrandDetailExternalLinksCardProps } from '@props/pages/brand-detail.props';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BrandDetailExternalLinksCard from '@/features/brands/components/sidebar/BrandDetailExternalLinksCard';

type ExternalLink = BrandDetailExternalLinksCardProps['links'][number];

function makeLink(overrides: Partial<ExternalLink> = {}): ExternalLink {
  return {
    category: LinkCategory.WEBSITE,
    id: 'link-1',
    label: 'Website',
    url: 'https://acme.example/about',
    ...overrides,
  } as ExternalLink;
}

describe('BrandDetailExternalLinksCard', () => {
  it('shows the section title and Add link outside any card, with an empty state', () => {
    render(
      <BrandDetailExternalLinksCard links={[]} onOpenLinkModal={vi.fn()} />,
    );

    expect(
      screen.getByRole('heading', { name: 'Website links' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add link' }),
    ).toBeInTheDocument();
    expect(screen.getByText('No website links yet.')).toBeInTheDocument();
  });

  it('opens the link modal empty from Add link', () => {
    const onOpenLinkModal = vi.fn();
    render(
      <BrandDetailExternalLinksCard
        links={[]}
        onOpenLinkModal={onOpenLinkModal}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));

    expect(onOpenLinkModal).toHaveBeenCalledWith();
  });

  it('lists manual links with their host and keeps other categories out', () => {
    render(
      <BrandDetailExternalLinksCard
        links={[
          makeLink({ id: 'link-1', label: 'Website' }),
          makeLink({
            category: LinkCategory.OTHER,
            id: 'link-2',
            label: 'Press kit',
            url: 'https://press.acme.example/kit',
          }),
          makeLink({
            category: LinkCategory.INSTAGRAM,
            id: 'link-3',
            label: 'Instagram',
            url: 'https://instagram.com/acme',
          }),
        ]}
        onOpenLinkModal={vi.fn()}
      />,
    );

    const website = screen.getByRole('link', { name: /Website/ });
    expect(website).toHaveAttribute('href', 'https://acme.example/about');
    expect(within(website).getByText('acme.example')).toBeInTheDocument();
    expect(
      within(screen.getByRole('link', { name: /Press kit/ })).getByText(
        'press.acme.example',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Instagram')).not.toBeInTheDocument();
    expect(screen.queryByText('No website links yet.')).not.toBeInTheDocument();
  });

  it('opens the link modal with the link being edited', () => {
    const onOpenLinkModal = vi.fn();
    const link = makeLink();
    render(
      <BrandDetailExternalLinksCard
        links={[link]}
        onOpenLinkModal={onOpenLinkModal}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit Website' }));

    expect(onOpenLinkModal).toHaveBeenCalledWith(link);
  });

  it('falls back to the raw url when it cannot be parsed', () => {
    render(
      <BrandDetailExternalLinksCard
        links={[makeLink({ label: 'Odd', url: 'not a url' })]}
        onOpenLinkModal={vi.fn()}
      />,
    );

    expect(screen.getByText('not a url')).toBeInTheDocument();
  });
});
