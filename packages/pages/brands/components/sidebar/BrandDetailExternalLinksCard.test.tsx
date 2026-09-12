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
  // Genuinely connected by default (externalId + a profile url) — tests
  // that care about the disconnected/no-identity/no-url edge cases
  // override those fields explicitly rather than relying on an implicit
  // "missing field means disconnected" default.
  return {
    credentialId: 'cred-1',
    externalId: 'ext-1',
    isConnected: true,
    platform: CredentialPlatform.INSTAGRAM,
    url: 'https://instagram.com/acme',
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

  it('links a connected account out to its profile when a url exists', () => {
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
        ]}
      />,
    );

    expect(screen.getByRole('link', { name: /Acme HQ/ })).toHaveAttribute(
      'href',
      'https://instagram.com/acme',
    );
  });

  it('drops a connected account with no profile url and no manage-social href', () => {
    render(
      <BrandDetailExternalLinksCard
        links={[]}
        onOpenLinkModal={vi.fn()}
        socialConnections={[
          makeConnection({
            credentialId: 'cred-2',
            handle: '@acme_x',
            platform: CredentialPlatform.TWITTER,
            url: undefined,
          }),
        ]}
      />,
    );

    // No derivable profile url and nowhere else to send the click — a bare
    // non-interactive row is worse than not showing it at all.
    expect(screen.queryByText('@acme_x')).not.toBeInTheDocument();
  });

  it('routes a connected account with no profile url to Social settings when a manage href is available', () => {
    render(
      <BrandDetailExternalLinksCard
        links={[]}
        manageSocialHref="/settings/social"
        onOpenLinkModal={vi.fn()}
        socialConnections={[
          makeConnection({
            credentialId: 'cred-2',
            handle: '@acme_x',
            platform: CredentialPlatform.TWITTER,
            url: undefined,
          }),
        ]}
      />,
    );

    expect(screen.getByText('@acme_x').closest('a')).toHaveAttribute(
      'href',
      '/settings/social',
    );
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
