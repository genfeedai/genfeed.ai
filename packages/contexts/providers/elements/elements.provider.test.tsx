// @vitest-environment jsdom
'use client';

import type { ElementsData } from '@genfeedai/services/elements/elements.service';
import {
  type ElementsContextValue,
  useElementsContext,
} from '@providers/elements/elements.context';
import ElementsProvider from '@providers/elements/elements.provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.fn();
const findAllElementsMock = vi.hoisted(() => vi.fn());

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => useAuthMock(),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService:
    <T,>(factory: (token: string) => T) =>
    async () =>
      factory('token'),
}));

vi.mock('@genfeedai/services/elements/elements.service', () => ({
  ElementsService: { findAllElements: findAllElementsMock },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@providers/elements-filters/elements-filters.provider', () => ({
  ElementsFiltersProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

vi.mock('@providers/elements-filters/elements-filters.context', () => ({
  useElementsFilters: () => ({
    filters: {},
    isRefreshing: false,
    query: {},
    setFilters: vi.fn(),
    setIsRefreshing: vi.fn(),
    setQuery: vi.fn(),
  }),
}));

function elementsData(moodLabels: string[]): ElementsData {
  return {
    blacklists: [],
    cameraMovements: [],
    cameras: [],
    lenses: [],
    lightings: [],
    moods: moodLabels.map((label, index) => ({
      createdAt: '2026-01-01T00:00:00.000Z',
      id: `mood_${index}`,
      isDeleted: false,
      key: label.toLowerCase(),
      label,
      updatedAt: '2026-01-01T00:00:00.000Z',
    })),
    scenes: [],
    sounds: [],
    styles: [],
  } as unknown as ElementsData;
}

let queryClient: QueryClient;

function QueryWrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

let contextValue: ElementsContextValue;

function MoodsConsumer() {
  contextValue = useElementsContext();
  const { error, isLoading, moods } = contextValue;
  return (
    <div>
      <span>{isLoading ? 'Loading elements' : 'Elements ready'}</span>
      <span>{error ? 'Elements failed' : 'No error'}</span>
      <span>{`${moods.length} moods`}</span>
      <span>{moods.map((mood) => mood.label).join(', ')}</span>
    </div>
  );
}

function SilentConsumer() {
  useElementsContext();
  return null;
}

function renderProvider(enabled = true) {
  return render(
    <ElementsProvider enabled={enabled}>
      <MoodsConsumer />
    </ElementsProvider>,
    { wrapper: QueryWrapper },
  );
}

function signedIn(sessionId: string) {
  return {
    isLoaded: true,
    isSignedIn: true,
    orgId: 'org_123',
    sessionId,
    userId: 'authProvider_123',
  };
}

describe('ElementsProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
      },
    });
    useAuthMock.mockReturnValue(signedIn('session_123'));
    findAllElementsMock.mockResolvedValue(elementsData(['Dramatic']));
  });

  it('renders children and provides context', async () => {
    renderProvider();

    expect(await screen.findByText('Elements ready')).toBeInTheDocument();
    expect(screen.getByText('1 moods')).toBeInTheDocument();
  });

  it('skips fetch when enabled is false', async () => {
    renderProvider(false);

    expect(await screen.findByText('Elements ready')).toBeInTheDocument();
    expect(screen.getByText('0 moods')).toBeInTheDocument();
    expect(findAllElementsMock).not.toHaveBeenCalled();
  });

  it('fetches elements when enabled is true', async () => {
    renderProvider(true);

    expect(await screen.findByText('Dramatic')).toBeInTheDocument();
  });

  it('does not fetch the catalogs until a consumer mounts', async () => {
    const { rerender } = render(
      <ElementsProvider enabled>
        <span>idle</span>
      </ElementsProvider>,
      { wrapper: QueryWrapper },
    );
    await Promise.resolve();
    expect(findAllElementsMock).not.toHaveBeenCalled();

    rerender(
      <ElementsProvider enabled>
        <SilentConsumer />
      </ElementsProvider>,
    );

    await waitFor(() => expect(findAllElementsMock).toHaveBeenCalledTimes(1));
  });

  it('paints the cached elements at once on a return visit', async () => {
    const firstVisit = renderProvider();
    expect(await screen.findByText('Dramatic')).toBeInTheDocument();
    firstVisit.unmount();

    findAllElementsMock.mockReturnValue(new Promise<never>(() => undefined));
    renderProvider();

    expect(screen.getByText('Elements ready')).toBeInTheDocument();
    expect(screen.getByText('Dramatic')).toBeInTheDocument();
  });

  it("never shows one session's elements in another", async () => {
    const firstSession = renderProvider();
    expect(await screen.findByText('Dramatic')).toBeInTheDocument();
    firstSession.unmount();

    useAuthMock.mockReturnValue(signedIn('session_456'));
    findAllElementsMock.mockReturnValue(new Promise<never>(() => undefined));
    renderProvider();

    expect(screen.getByText('Loading elements')).toBeInTheDocument();
    expect(screen.getByText('0 moods')).toBeInTheDocument();
  });

  it('keeps the loaded elements when a refresh fails', async () => {
    renderProvider();
    expect(await screen.findByText('Dramatic')).toBeInTheDocument();

    findAllElementsMock.mockRejectedValue(new Error('offline'));
    await act(async () => {
      await contextValue.refetch();
    });

    expect(screen.getByText('Elements ready')).toBeInTheDocument();
    expect(screen.getByText('Dramatic')).toBeInTheDocument();
    expect(screen.getByText('No error')).toBeInTheDocument();
  });

  it('reports an error when the first read fails', async () => {
    findAllElementsMock.mockRejectedValue(new Error('offline'));
    renderProvider();

    expect(await screen.findByText('Elements failed')).toBeInTheDocument();
    expect(screen.getByText('0 moods')).toBeInTheDocument();
  });
});
