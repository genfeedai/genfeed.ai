// @vitest-environment jsdom
'use client';

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.fn();
const useAuthedServiceMock = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) =>
    useAuthedServiceMock(factory),
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
  useElementsFilters: () => ({
    filters: {},
    isRefreshing: false,
    query: {},
    setFilters: vi.fn(),
    setIsRefreshing: vi.fn(),
    setQuery: vi.fn(),
  }),
}));

describe('ElementsProvider', () => {
  let ElementsProvider: typeof import('@providers/elements/elements.provider').default;
  let useElementsContext: typeof import('@providers/elements/elements.provider').useElementsContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      orgId: 'org_123',
      sessionId: 'session_123',
      userId: 'clerk_123',
    });

    useAuthedServiceMock.mockImplementation(() =>
      vi.fn().mockResolvedValue({
        blacklists: [],
        cameraMovements: [],
        cameras: [],
        lenses: [],
        lightings: [],
        moods: [{ id: 'mood_1', label: 'Dramatic' }],
        scenes: [],
        sounds: [],
        styles: [],
      }),
    );

    const module = await import('@providers/elements/elements.provider');
    ElementsProvider = module.default;
    useElementsContext = module.useElementsContext;
  });

  it('renders children and provides context', async () => {
    function Consumer() {
      const { isLoading, moods } = useElementsContext();
      return (
        <div>
          <span data-testid="loading">{String(isLoading)}</span>
          <span data-testid="mood-count">{String(moods.length)}</span>
        </div>
      );
    }

    render(
      <ElementsProvider>
        <Consumer />
      </ElementsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('mood-count')).toHaveTextContent('1');
  });

  it('skips fetch when enabled is false', async () => {
    const fetchSpy = vi.fn();
    useAuthedServiceMock.mockImplementation(() => fetchSpy);

    function Consumer() {
      const { isLoading } = useElementsContext();
      return <span data-testid="loading">{String(isLoading)}</span>;
    }

    render(
      <ElementsProvider enabled={false}>
        <Consumer />
      </ElementsProvider>,
    );

    // Give time for any async effects to settle
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toBeInTheDocument();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches elements when enabled is true', async () => {
    function Consumer() {
      const { moods } = useElementsContext();
      return <span data-testid="mood-count">{String(moods.length)}</span>;
    }

    render(
      <ElementsProvider enabled>
        <Consumer />
      </ElementsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('mood-count')).toHaveTextContent('1');
    });
  });
});
