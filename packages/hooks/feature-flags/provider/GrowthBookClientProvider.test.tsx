import { useGrowthBookClientStatus } from '@hooks/feature-flags/provider/GrowthBookClientProvider';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInit = vi.fn();
const mockDestroy = vi.fn();
const mockGrowthBookConstructor = vi.fn();
const mockSetFeatures = vi.fn();

vi.mock('@growthbook/growthbook-react', () => {
  function GrowthBookMock(config: unknown) {
    mockGrowthBookConstructor(config);
    return {
      destroy: mockDestroy,
      init: mockInit,
      setFeatures: mockSetFeatures,
    };
  }

  return {
    GrowthBook: GrowthBookMock,
    GrowthBookProvider: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="gb-provider">{children}</div>
    ),
  };
});

import { GrowthBookClientProvider } from '@hooks/feature-flags/provider/GrowthBookClientProvider';

describe('GrowthBookClientProvider', () => {
  beforeEach(() => {
    mockDestroy.mockReset();
    mockGrowthBookConstructor.mockReset();
    mockInit.mockReset();
    mockInit.mockResolvedValue(undefined);
    mockSetFeatures.mockReset();
  });

  it('marks the client as unconfigured when no config is provided', () => {
    let status: { isConfigured: boolean; isReady: boolean } | null = null;

    function Probe() {
      status = useGrowthBookClientStatus();
      return <span>child content</span>;
    }

    render(
      <GrowthBookClientProvider>
        <Probe />
      </GrowthBookClientProvider>,
    );

    expect(screen.getByText('child content')).toBeDefined();
    expect(status).toEqual({ isConfigured: false, isReady: true });
  });

  it('renders children when no config is provided', () => {
    render(
      <GrowthBookClientProvider>
        <span>child content</span>
      </GrowthBookClientProvider>,
    );

    expect(screen.getByText('child content')).toBeDefined();
  });

  it('renders children inside GrowthBookProvider when configured', () => {
    render(
      <GrowthBookClientProvider
        apiHost="https://cdn.growthbook.io"
        clientKey="sdk-test-key"
        organizationId="org-123"
        plan="pro"
        userId="user-123"
      >
        <span>wrapped content</span>
      </GrowthBookClientProvider>,
    );

    expect(screen.getByTestId('gb-provider')).toBeDefined();
    expect(screen.getByText('wrapped content')).toBeDefined();
    expect(mockGrowthBookConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        apiHost: 'https://cdn.growthbook.io',
        attributes: {
          id: 'user-123',
          organizationId: 'org-123',
          plan: 'pro',
        },
        clientKey: 'sdk-test-key',
      }),
    );
  });

  it('calls init with streaming enabled', async () => {
    mockInit.mockResolvedValue(undefined);

    render(
      <GrowthBookClientProvider
        apiHost="https://cdn.growthbook.io"
        clientKey="sdk-test-key"
      >
        <span>test</span>
      </GrowthBookClientProvider>,
    );

    expect(mockInit).toHaveBeenCalledWith({ streaming: true });
  });

  it('uses explicit local defaults without remote GrowthBook config', () => {
    render(
      <GrowthBookClientProvider
        defaults={{ analytics: true }}
        apiHost=""
        clientKey=""
      >
        <span>defaults only</span>
      </GrowthBookClientProvider>,
    );

    expect(mockSetFeatures).toHaveBeenCalledWith({
      analytics: { defaultValue: true },
    });
    expect(mockInit).not.toHaveBeenCalled();
  });

  it('stays in loading state while remote GrowthBook initialization is pending', async () => {
    let resolveInit: (() => void) | null = null;
    mockInit.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveInit = resolve;
        }),
    );

    function Probe() {
      const status = useGrowthBookClientStatus();
      return <span>{status.isReady ? 'ready' : 'loading'}</span>;
    }

    render(
      <GrowthBookClientProvider
        apiHost="https://cdn.growthbook.io"
        clientKey="sdk-test-key"
      >
        <Probe />
      </GrowthBookClientProvider>,
    );

    expect(screen.getByText('loading')).toBeDefined();

    await act(async () => {
      resolveInit?.();
    });
    expect(mockInit).toHaveBeenCalledWith({ streaming: true });
  });

  it('does not render GrowthBookProvider when apiHost is empty', () => {
    render(
      <GrowthBookClientProvider apiHost="" clientKey="sdk-key" defaults={{}}>
        <span>no provider</span>
      </GrowthBookClientProvider>,
    );

    expect(screen.queryByTestId('gb-provider')).toBeNull();
    expect(screen.getByText('no provider')).toBeDefined();
  });

  it('does not render GrowthBookProvider when clientKey is empty', () => {
    render(
      <GrowthBookClientProvider
        apiHost="https://cdn.growthbook.io"
        clientKey=""
        defaults={{}}
      >
        <span>no provider</span>
      </GrowthBookClientProvider>,
    );

    expect(screen.queryByTestId('gb-provider')).toBeNull();
    expect(screen.getByText('no provider')).toBeDefined();
  });
});
