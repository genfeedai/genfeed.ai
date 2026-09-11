import { CredentialPlatform } from '@genfeedai/contracts';
import ConnectAccountModal from '@pages/brands/components/integrations/ConnectAccountModal';
import { fireEvent, render, screen } from '@testing-library/react';
import type {
  OAuthConnectPlatformGroup,
  ResolvedOAuthConnectPlatform,
} from '@ui/constants/oauth-connect-platforms';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

// cmdk measures its list with ResizeObserver, which jsdom does not implement.
class MockResizeObserver {
  disconnect = vi.fn();
  observe = vi.fn();
  unobserve = vi.fn();
}

beforeEach(() => {
  globalThis.ResizeObserver =
    MockResizeObserver as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView = vi.fn();
});

function Icon() {
  return <svg data-testid="icon" />;
}

const twitter: ResolvedOAuthConnectPlatform = {
  category: 'social',
  Icon,
  iconClassName: '',
  isConnectAvailable: true,
  label: 'Twitter',
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
      platforms: [twitter, threads],
    },
    {
      description: 'Publish long-form and short-form video content.',
      id: 'video',
      label: 'Video',
      platforms: [youtube],
    },
  ];

describe('ConnectAccountModal', () => {
  it('starts oauth for an available platform', () => {
    const onConnect = vi.fn();
    render(
      <ConnectAccountModal
        connectingPlatform={null}
        onConnect={onConnect}
        onOpenChange={vi.fn()}
        open
        platformConnectedCounts={{ [CredentialPlatform.TWITTER]: 1 }}
        platformGroups={platformGroups}
      />,
    );

    fireEvent.click(screen.getByText('Twitter'));
    expect(onConnect).toHaveBeenCalledWith(twitter);
  });

  it('shows the connected count per platform', () => {
    render(
      <ConnectAccountModal
        connectingPlatform={null}
        onConnect={vi.fn()}
        onOpenChange={vi.fn()}
        open
        platformConnectedCounts={{ [CredentialPlatform.TWITTER]: 2 }}
        platformGroups={platformGroups}
      />,
    );

    expect(screen.getByText('2 connected')).toBeInTheDocument();
    // YouTube has no entry in `platformConnectedCounts` and falls back to
    // zero. Threads shows its unavailable reason instead of a count.
    expect(screen.getByText('0 connected')).toBeInTheDocument();
  });

  it('disables an unavailable platform with a reason and blocks the connect call', () => {
    const onConnect = vi.fn();
    render(
      <ConnectAccountModal
        connectingPlatform={null}
        onConnect={onConnect}
        onOpenChange={vi.fn()}
        open
        platformConnectedCounts={{}}
        platformGroups={platformGroups}
      />,
    );

    expect(screen.getByText('Not available yet')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Threads'));
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('filters the list by search', () => {
    render(
      <ConnectAccountModal
        connectingPlatform={null}
        onConnect={vi.fn()}
        onOpenChange={vi.fn()}
        open
        platformConnectedCounts={{}}
        platformGroups={platformGroups}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Search platforms…'), {
      target: { value: 'YouTube' },
    });

    expect(screen.getByText('YouTube')).toBeInTheDocument();
    expect(screen.queryByText('Twitter')).not.toBeInTheDocument();
  });

  it('shows a no-results state when the search matches nothing', () => {
    render(
      <ConnectAccountModal
        connectingPlatform={null}
        onConnect={vi.fn()}
        onOpenChange={vi.fn()}
        open
        platformConnectedCounts={{}}
        platformGroups={platformGroups}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Search platforms…'), {
      target: { value: 'nonexistent-platform' },
    });

    expect(screen.getByText('No platforms found.')).toBeInTheDocument();
  });
});
