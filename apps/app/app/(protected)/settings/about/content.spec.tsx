import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AboutContent from './content';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../tests/next-intl.stub'
  );
  const translate = translateFromCatalog('pages.about');
  return { useTranslations: () => translate };
});

const metadata = vi.hoisted(() => ({
  channel: 'main',
  commitSha: 'abc123456',
  releaseTag: null as string | null,
  version: '0.1.70',
}));
vi.mock('@app-config/build-metadata.config', () => ({
  BUILD_METADATA: metadata,
}));
vi.mock('@ui/card/Card', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
}));
vi.mock('@genfeedai/config/deployment', () => ({
  getDeployment: vi.fn(() => 'self-hosted'),
  getClientSurface: vi.fn(() => 'web'),
}));
vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.test/v1' },
}));
vi.mock('@/lib/desktop/runtime', () => ({
  getDesktopBridge: vi.fn(() => null),
}));
vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    onClick,
    isDisabled,
  }: {
    children: React.ReactNode;
    onClick: () => void;
    isDisabled?: boolean;
  }) => (
    <button type="button" disabled={isDisabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

import { getClientSurface, getDeployment } from '@genfeedai/config/deployment';
import { getDesktopBridge } from '@/lib/desktop/runtime';

afterEach(() => {
  vi.unstubAllGlobals();
  metadata.releaseTag = null;
  vi.mocked(getClientSurface).mockReturnValue('web');
  vi.mocked(getDeployment).mockReturnValue('self-hosted');
});
describe('About', () => {
  it('hydrates the server surface before loading desktop diagnostics', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<AboutContent />);
    expect(container.textContent).toContain('web');
    vi.mocked(getClientSurface).mockReturnValue('desktop');
    vi.mocked(getDesktopBridge).mockReturnValue({
      app: {
        getDiagnostics: vi.fn().mockResolvedValue({ version: '0.3.0' }),
      },
    } as unknown as NonNullable<ReturnType<typeof getDesktopBridge>>);
    const onRecoverableError = vi.fn();
    const root = hydrateRoot(container, <AboutContent />, {
      onRecoverableError,
    });
    try {
      await waitFor(() => expect(container.textContent).toContain('0.3.0'));
      expect(container.textContent).toContain('desktop');
      expect(onRecoverableError).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
    }
  });
  it('links a real release and copies a complete support line', async () => {
    metadata.releaseTag = 'v0.1.70';
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<AboutContent />);
    expect(
      screen.getByRole('link', { name: 'v0.1.70' }).getAttribute('href'),
    ).toBe('https://github.com/genfeedai/genfeed.ai/releases/tag/v0.1.70');
    fireEvent.click(screen.getByRole('button', { name: 'Copy build details' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        'v0.1.70 · abc1234 · self-hosted · web · version 0.1.70 · channel main',
      ),
    );
  });
  it('shows a newer stable release from the API host', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            tag: 'v0.1.71',
            version: '0.1.71',
            url: 'https://github.com/genfeedai/genfeed.ai/releases/tag/v0.1.71',
          }),
        ),
      ),
    );
    render(<AboutContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'v0.1.71 available' }),
      ).toBeTruthy(),
    );
  });
  it('shows the Electron version independently of release channel', async () => {
    vi.mocked(getClientSurface).mockReturnValue('desktop');
    vi.mocked(getDesktopBridge).mockReturnValue({
      app: {
        getDiagnostics: vi.fn().mockResolvedValue({
          version: '0.3.0',
          releaseChannel: 'production',
        }),
      },
    } as unknown as NonNullable<ReturnType<typeof getDesktopBridge>>);
    render(<AboutContent />);
    await waitFor(() => expect(screen.getByText('0.3.0')).toBeTruthy());
    expect(screen.getByText('main')).toBeTruthy();
  });
  it('shows unreleased build and has no fabricated release link', () => {
    render(<AboutContent />);
    expect(screen.getByText('unreleased build')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /^v\d/ })).toBeNull();
    expect(screen.getByText('main')).toBeTruthy();
  });
  it('hides update checks on cloud', () => {
    vi.mocked(getDeployment).mockReturnValue('cloud');
    render(<AboutContent />);
    expect(
      screen.queryByRole('button', { name: 'Check for updates' }),
    ).toBeNull();
  });
  it('shows a nonblocking failure from the API host', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetcher);
    render(<AboutContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    await waitFor(() =>
      expect(
        screen.getByText('Could not check for updates. Try again later.'),
      ).toBeTruthy(),
    );
    expect(fetcher.mock.calls[0][0]).toBe('/v1/system/latest-release');
  });
});
