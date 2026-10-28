import { CredentialPlatform } from '@genfeedai/contracts';
import ConnectAccountModal from '@pages/brands/components/integrations/ConnectAccountModal';
import type { BrandDetailSocialConnection } from '@props/pages/brand-detail.props';
import type { ConnectAccountModalProps } from '@props/pages/brand-integrations.props';
import { fireEvent, render, screen } from '@testing-library/react';
import type {
  OAuthConnectPlatformGroup,
  ResolvedOAuthConnectPlatform,
} from '@ui/components/constants/oauth-connect-platforms';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

function Icon() {
  return <svg data-testid="icon" />;
}

const x: ResolvedOAuthConnectPlatform = {
  category: 'social',
  Icon,
  iconClassName: '',
  isConnectAvailable: true,
  label: 'X',
  platform: CredentialPlatform.TWITTER,
  readiness: 'available',
};

const threads: ResolvedOAuthConnectPlatform = {
  category: 'social',
  Icon,
  iconClassName: '',
  isConnectAvailable: false,
  label: 'Threads',
  platform: CredentialPlatform.THREADS,
  readiness: 'unavailable',
};

const youtube: ResolvedOAuthConnectPlatform = {
  category: 'video',
  Icon,
  iconClassName: '',
  isConnectAvailable: true,
  label: 'YouTube',
  platform: CredentialPlatform.YOUTUBE,
  readiness: 'available',
};

const platformGroups: OAuthConnectPlatformGroup<ResolvedOAuthConnectPlatform>[] =
  [
    {
      description: 'Post and manage text, image, and link updates.',
      id: 'social',
      label: 'Social networks',
      platforms: [x, threads],
    },
    {
      description: 'Publish long-form and short-form video content.',
      id: 'video',
      label: 'Video',
      platforms: [youtube],
    },
  ];

function connection(
  credentialId: string,
  name: string,
): BrandDetailSocialConnection {
  return {
    credentialId,
    isConnected: true,
    name,
    platform: CredentialPlatform.TWITTER,
  };
}

function renderModal(overrides: Partial<ConnectAccountModalProps> = {}) {
  const props: ConnectAccountModalProps = {
    connectingPlatform: null,
    onConnect: vi.fn(),
    onOpenChange: vi.fn(),
    open: true,
    platformConnections: {},
    platformGroups,
    ...overrides,
  };
  render(<ConnectAccountModal {...props} />);
  return props;
}

// A connected tile's accessible name starts with its avatar initials, so find
// the tile through its visible label instead.
function getTile(label: string): HTMLElement {
  const tile = screen.getByText(label).closest('button');
  if (!tile) {
    throw new Error(`No tile button for ${label}`);
  }
  return tile;
}

describe('ConnectAccountModal', () => {
  it('names the dialog and describes it from the real catalog, not a raw key path', () => {
    renderModal();

    // A key/catalog mismatch makes the stub return the dotted key path
    // itself instead of copy, so assert the real sentence.
    const dialog = screen.getByRole('dialog', { name: 'Connect account' });
    expect(dialog).toHaveAccessibleDescription(
      'Choose a platform to connect. Search or browse by category.',
    );
  });

  it('groups platforms under their category heading', () => {
    renderModal();

    expect(screen.getByText('Social networks')).toBeInTheDocument();
    expect(screen.getByText('Video')).toBeInTheDocument();
  });

  it('starts oauth for an available platform', () => {
    const { onConnect } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: /^X/ }));

    expect(onConnect).toHaveBeenCalledWith(x);
  });

  it('shows each connected account and the count on its platform', () => {
    renderModal({
      platformConnections: {
        [CredentialPlatform.TWITTER]: [
          connection('1', 'Vincent Decoders'),
          connection('2', 'Genfeed'),
        ],
      },
    });

    expect(screen.getByText('2 connected')).toBeInTheDocument();
    expect(screen.getByText('VD')).toBeInTheDocument();
    expect(screen.getByText('G')).toBeInTheDocument();
    // YouTube has no connections, so it offers to connect instead.
    expect(screen.getByRole('button', { name: /^YouTube/ })).toHaveTextContent(
      'Connect',
    );
  });

  it('keeps a connected platform clickable so another account can be added', () => {
    const { onConnect } = renderModal({
      platformConnections: {
        [CredentialPlatform.TWITTER]: [connection('1', 'Vincent')],
      },
    });

    fireEvent.click(getTile('X'));

    expect(onConnect).toHaveBeenCalledWith(x);
  });

  it('disables an unavailable platform and shows why', () => {
    const { onConnect } = renderModal();

    const tile = screen.getByRole('button', { name: /^Threads/ });
    expect(tile).toBeDisabled();
    expect(tile).toHaveTextContent('Not available yet');

    fireEvent.click(tile);
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('disables every tile while one platform is connecting', () => {
    renderModal({ connectingPlatform: CredentialPlatform.YOUTUBE });

    expect(getTile('X')).toBeDisabled();
    expect(getTile('YouTube')).toHaveTextContent('Connecting…');
  });

  it('filters the grid by search', () => {
    renderModal();

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search platforms…' }),
      {
        target: { value: 'YouTube' },
      },
    );

    expect(screen.getByText('YouTube')).toBeInTheDocument();
    expect(screen.queryByText('Threads')).not.toBeInTheDocument();
    expect(screen.queryByText('Social networks')).not.toBeInTheDocument();
  });

  it('shows a no-results state when the search matches nothing', () => {
    renderModal();

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search platforms…' }),
      {
        target: { value: 'nonexistent-platform' },
      },
    );

    expect(screen.getByText('No platforms found.')).toBeInTheDocument();
  });

  it('connects the only matching platform when Enter is pressed in search', () => {
    const { onConnect } = renderModal();
    const search = screen.getByRole('textbox', { name: 'Search platforms…' });

    fireEvent.change(search, { target: { value: 'YouTube' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(onConnect).toHaveBeenCalledWith(youtube);
  });

  it('ignores Enter when several platforms still match', () => {
    const { onConnect } = renderModal();

    fireEvent.keyDown(
      screen.getByRole('textbox', { name: 'Search platforms…' }),
      { key: 'Enter' },
    );

    expect(onConnect).not.toHaveBeenCalled();
  });

  it('does not connect an unavailable platform through Enter', () => {
    const { onConnect } = renderModal();
    const search = screen.getByRole('textbox', { name: 'Search platforms…' });

    fireEvent.change(search, { target: { value: 'Threads' } });
    expect(screen.getByText('Threads')).toBeInTheDocument();
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(onConnect).not.toHaveBeenCalled();
  });
});
