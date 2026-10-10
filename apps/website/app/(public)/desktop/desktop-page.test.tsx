import { DesktopOs } from '@genfeedai/contracts';
import DesktopContent from '@public/desktop/desktop-content';
import DesktopPage, { generateMetadata } from '@public/desktop/page';
import DownloadPage from '@public/download/page';
import { render, screen } from '@testing-library/react';
import type { ResolvingMetadata } from 'next';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getBuild, getHeaders, permanentRedirect } = vi.hoisted(() => ({
  getBuild: vi.fn(),
  getHeaders: vi.fn(),
  permanentRedirect: vi.fn(),
}));

vi.mock('@data/desktop-release.data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@data/desktop-release.data')>()),
  getLatestDesktopBuild: getBuild,
}));
vi.mock('next/headers', () => ({ headers: getHeaders }));
vi.mock('next/navigation', () => ({ permanentRedirect }));
vi.mock('@web-components/MarketingEntrance', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@web-components/PageLayout', () => ({
  default: ({
    children,
    description,
    heroActions,
    heroDetails,
    title,
  }: {
    children: ReactNode;
    description: ReactNode;
    heroActions: ReactNode;
    heroDetails: ReactNode;
    title: ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {heroActions}
      {heroDetails}
      {children}
    </main>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  getHeaders.mockResolvedValue(
    new Headers({ 'sec-ch-ua-platform': '"macOS"' }),
  );
  getBuild.mockResolvedValue(null);
});

describe('Desktop product landing', () => {
  it('uses one permanent landing alias without resolving a release', () => {
    DownloadPage();
    expect(permanentRedirect).toHaveBeenCalledExactlyOnceWith('/desktop');
    expect(getBuild).not.toHaveBeenCalled();
  });

  it('renders the current validated release with first-paint platform detection', async () => {
    const downloadUrl =
      'https://github.com/genfeedai/genfeed.ai/releases/download/desktop-v0.2.0/GenFeed-0.2.0-arm64.dmg';
    getBuild.mockResolvedValue({
      downloadUrl,
      fileSizeBytes: 104857600,
      version: '0.2.0',
    });
    render(await DesktopPage());
    expect(
      screen.getByRole('link', { name: /Download for macOS/ }),
    ).toHaveAttribute('href', downloadUrl);
    expect(
      screen.getByRole('link', { name: /Download \.dmg/ }),
    ).toHaveAttribute('href', downloadUrl);
    expect(screen.getAllByText(/macOS 13 Ventura or later/)).toHaveLength(2);
    expect(getBuild).toHaveBeenCalledOnce();
  });

  it('keeps downloads unavailable when there is no published build', async () => {
    render(await DesktopPage());
    expect(
      screen.getByRole('button', { name: 'macOS build coming soon' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('link', { name: /Download/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Use it in the browser' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/brew install/)).not.toBeInTheDocument();
  });

  it('does not offer an invented Windows release', () => {
    render(
      <DesktopContent
        detectedOs={DesktopOs.WINDOWS}
        downloadUrl={null}
        fileSize={null}
        version={null}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Windows build coming soon' }),
    ).toBeDisabled();
  });

  it('points canonical and sharing metadata at the product landing', async () => {
    const parent = Promise.resolve({ openGraph: null }) as ResolvingMetadata;
    const metadata = await generateMetadata({}, parent);
    expect(metadata.alternates?.canonical).toBe('https://genfeed.ai/desktop');
    expect(metadata.openGraph?.url).toBe('https://genfeed.ai/desktop');
    expect(metadata.openGraph?.images).toEqual([
      expect.objectContaining({ url: 'https://genfeed.ai/og/download' }),
    ]);
  });
});
