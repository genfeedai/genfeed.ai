import { CredentialPlatform, LinkCategory } from '@genfeedai/contracts';
import BrandDetailExternalLinksCard from '@pages/brands/components/sidebar/BrandDetailExternalLinksCard';
import type {
  BrandDetailExternalLinksCardProps,
  BrandDetailSocialConnection,
} from '@props/pages/brand-detail.props';
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

function makeConnection(
  overrides: Partial<BrandDetailSocialConnection> = {},
): BrandDetailSocialConnection {
  return {
    credentialId: 'cred-1',
    platform: CredentialPlatform.INSTAGRAM,
    ...overrides,
  };
}

describe('BrandDetailExternalLinksCard', () => {
  it('should render without crashing', () => {
    render(
      <BrandDetailExternalLinksCard links={[]} onOpenLinkModal={vi.fn()} />,
    );
    expect(screen.getByText('External Links')).toBeInTheDocument();
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

  it('renders connected socials, linking out only when a url exists', () => {
    render(
      <BrandDetailExternalLinksCard
        links={[]}
        onOpenLinkModal={vi.fn()}
        socialConnections={[
          makeConnection({
            credentialId: 'cred-1',
            name: 'Acme HQ',
            url: 'https://instagram.com/acme',
          }),
          makeConnection({
            credentialId: 'cred-2',
            handle: '@acme_x',
            platform: CredentialPlatform.TWITTER,
          }),
        ]}
      />,
    );

    expect(screen.getByRole('link', { name: /Acme HQ/ })).toHaveAttribute(
      'href',
      'https://instagram.com/acme',
    );
    expect(screen.getByText('@acme_x')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /@acme_x/ })).toBeNull();
  });

  it.each([
    [{ label: 'Acme Label', name: null }, 'Acme Label'],
    [{ handle: 'acme_handle' }, '@acme_handle'],
    [{}, CredentialPlatform.INSTAGRAM],
  ])('falls back through the connection label chain', (overrides, expected) => {
    render(
      <BrandDetailExternalLinksCard
        links={[]}
        onOpenLinkModal={vi.fn()}
        socialConnections={[makeConnection(overrides)]}
      />,
    );

    expect(screen.getAllByText(expected).length).toBeGreaterThan(0);
  });

  it('shows the connect prompt when there are no connections but a manage href', () => {
    render(
      <BrandDetailExternalLinksCard
        links={[]}
        manageSocialHref="/settings/social"
        onOpenLinkModal={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('link', { name: 'Connect under Social' }),
    ).toHaveAttribute('href', '/settings/social');
  });
});
