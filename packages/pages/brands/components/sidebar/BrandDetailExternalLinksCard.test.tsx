import { LinkCategory } from '@genfeedai/contracts';
import BrandDetailExternalLinksCard from '@pages/brands/components/sidebar/BrandDetailExternalLinksCard';
import type { BrandDetailExternalLinksCardProps } from '@props/pages/brand-detail.props';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

type ExternalLink = BrandDetailExternalLinksCardProps['links'][number];

function makeLink(overrides: Partial<ExternalLink> = {}): ExternalLink {
  return {
    category: LinkCategory.WEBSITE,
    id: 'link-1',
    label: 'Website',
    url: 'https://acme.example',
    ...overrides,
  } as ExternalLink;
}

describe('BrandDetailExternalLinksCard', () => {
  it('should render without crashing', () => {
    render(
      <BrandDetailExternalLinksCard links={[]} onOpenLinkModal={vi.fn()} />,
    );
    expect(screen.getByText('Website links')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /add website link/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('No website links yet.')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const onOpenLinkModal = vi.fn();
    render(
      <BrandDetailExternalLinksCard
        links={[]}
        onOpenLinkModal={onOpenLinkModal}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /add website link/i }));
    expect(onOpenLinkModal).toHaveBeenCalledWith();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <BrandDetailExternalLinksCard links={[]} onOpenLinkModal={vi.fn()} />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
    expect(rootElement).toHaveClass('rounded-card');
    expect(rootElement).toHaveClass('bg-card');
  });

  it('renders manual website links and keeps non-manual categories out', () => {
    render(
      <BrandDetailExternalLinksCard
        links={[
          makeLink({ id: 'link-1', label: 'Website' }),
          makeLink({
            category: LinkCategory.OTHER,
            id: 'link-2',
            label: 'Press kit',
            url: 'https://acme.example/press',
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

    expect(screen.getByText('Website')).toBeInTheDocument();
    expect(screen.getByText('Press kit')).toBeInTheDocument();
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

  it('shows the website-links title without a connected-accounts summary', () => {
    render(
      <BrandDetailExternalLinksCard links={[]} onOpenLinkModal={vi.fn()} />,
    );

    expect(screen.getByText('Website links')).toBeInTheDocument();
    expect(screen.queryByText('Manage')).not.toBeInTheDocument();
    expect(screen.queryByText(/connected/)).not.toBeInTheDocument();
  });

  it('merges the connected count, Manage and website links into one card', () => {
    render(
      <BrandDetailExternalLinksCard
        links={[makeLink({ label: 'Website' })]}
        onOpenLinkModal={vi.fn()}
        social={{
          connectedAdAccountCount: 0,
          connectedSocialCount: 4,
          manageHref: '/settings/connected-accounts',
        }}
      />,
    );

    expect(screen.getByText('Social & links')).toBeInTheDocument();
    expect(screen.getByText('4 connected')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage' })).toHaveAttribute(
      'href',
      '/settings/connected-accounts',
    );
    expect(screen.getByText('Website')).toBeInTheDocument();
    // Connected accounts are summarised, never repeated as rows.
    expect(screen.queryByText('INSTAGRAM')).not.toBeInTheDocument();
  });

  it.each([
    [1, '4 connected · 1 ad account'],
    [2, '4 connected · 2 ad accounts'],
  ])('counts ad accounts apart from social profiles (%i)', (ads, expected) => {
    render(
      <BrandDetailExternalLinksCard
        links={[]}
        onOpenLinkModal={vi.fn()}
        social={{
          connectedAdAccountCount: ads,
          connectedSocialCount: 4,
          manageHref: '/settings/connected-accounts',
        }}
      />,
    );

    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});
