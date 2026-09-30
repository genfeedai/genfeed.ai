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
  it('renders the modal title and description from the real catalog, not a raw key path', () => {
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

    // A key/catalog mismatch makes the stub return the dotted key path
    // itself (e.g. "brandSocialMedia.connectAccountDescription") instead of
    // copy — asserting the real sentence catches that regression.
    expect(
      screen.getByText(
        'Choose a platform to connect. Search or browse by category.',
      ),
    ).toBeInTheDocument();
  });

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

  it('shows a reason instead of a count for an unavailable platform', () => {
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

    expect(screen.getByText('Not available yet')).toBeInTheDocument();
  });

  it('selects an enabled platform through a real keyboard selection path', () => {
    // The positive counterpart of the disabled-item test below: narrow the
    // list to just Twitter (enabled) via search — cmdk auto-highlights the
    // sole remaining item — then confirm Enter actually fires `onConnect`,
    // proving Enter drives real selection rather than being a no-op for
    // every item regardless of `disabled`.
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

    const searchInput = screen.getByPlaceholderText('Search platforms…');
    fireEvent.change(searchInput, { target: { value: 'Twitter' } });
    expect(screen.getByText('Twitter')).toBeInTheDocument();
    expect(screen.queryByText('Threads')).not.toBeInTheDocument();

    fireEvent.keyDown(searchInput, { key: 'Enter' });

    expect(onConnect).toHaveBeenCalledWith(twitter);
  });

  it('does not select a disabled platform through a real keyboard selection path', () => {
    // cmdk marks `disabled` items unselectable and skips them during arrow
    // navigation, so Enter never fires their `onSelect` — narrow the list to
    // just the disabled platform via search so nothing else could be
    // selected by accident, then confirm Enter is a no-op.
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

    const searchInput = screen.getByPlaceholderText('Search platforms…');
    fireEvent.change(searchInput, { target: { value: 'Threads' } });
    expect(screen.getByText('Threads')).toBeInTheDocument();

    fireEvent.keyDown(searchInput, { key: 'Enter' });

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

  it('associates the search field with a real <label>, not just a placeholder fallback', () => {
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

    // `toHaveAccessibleName('Search platforms…')` alone is tautological here:
    // the placeholder carries the exact same catalog string, so it would
    // pass even with the `label` prop deleted entirely (jsdom falls back to
    // the placeholder once no accessible name is found). Assert the actual
    // DOM wiring instead — cmdk's `Command` root renders a real
    // `<label htmlFor>` pointed at the input's own id — which only exists
    // because `label` was passed to `Command`.
    const searchInput = screen.getByPlaceholderText('Search platforms…');
    const inputId = searchInput.getAttribute('id');
    expect(inputId).toBeTruthy();

    // No query-by-role/text form proves a native `for`/`id` association,
    // so reach into the DOM directly for this one assertion.
    const labelElement = document.querySelector(`label[for="${inputId}"]`);
    expect(labelElement).not.toBeNull();
    expect(labelElement).toHaveTextContent('Search platforms…');
  });
});
