import { paginatedResponse } from '@app-tests/paginated-response';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import { ElementScene } from '@models/elements/scene.model';
import type { QueryClient } from '@tanstack/react-query';

import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ScenesList from './scenes-list';
import '@testing-library/jest-dom/vitest';

const findAllPageMock =
  vi.fn<() => Promise<IPaginatedResponse<ElementScene>>>();
const getServiceMock = vi.fn(async () => ({ findAllPage: findAllPageMock }));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => getServiceMock),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

const scope = vi.hoisted(() => ({ organizationId: 'org-1' }));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: scope.organizationId }),
}));

function renderScenes(client: QueryClient = createTestQueryClient()) {
  return render(<ScenesList />, { wrapper: queryClientWrapper(client) });
}

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/org-123/~/settings/elements/scenes'),
  useRouter: vi.fn(() => ({
    replace: vi.fn(),
  })),
  useSearchParams: vi.fn(() => ({
    get: vi.fn((key: string) => (key === 'page' ? '1' : null)),
    toString: vi.fn(() => 'page=1'),
  })),
}));

const notifications = { error: vi.fn(), success: vi.fn() };
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => notifications),
  },
}));

const DUSK_PIER = new ElementScene({
  id: 'scene-1',
  key: 'dusk',
  label: 'Dusk Pier',
});

describe('ScenesList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scope.organizationId = 'org-1';
    findAllPageMock.mockResolvedValue(paginatedResponse([]));
  });

  it('renders the empty list', async () => {
    const { container } = renderScenes();
    expect(container.firstChild).toBeInTheDocument();
    expect(await screen.findByText('No scenes found')).toBeInTheDocument();
  });

  it('offers the shared search field', async () => {
    renderScenes();
    expect(
      screen.getByRole('textbox', { name: 'Search scenes' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('No scenes found')).toBeInTheDocument();
  });
  it('renders the totals from the same response as its scenes', async () => {
    findAllPageMock.mockResolvedValue(
      paginatedResponse([], { totalDocs: 61, totalPages: 5 }),
    );
    const { rerender } = renderScenes();
    expect(await screen.findByText('61 scenes')).toBeVisible();

    rerender(<ScenesList />);
    expect(screen.getByText('61 scenes')).toBeVisible();
    expect(screen.queryByText('200 scenes')).not.toBeInTheDocument();
  });

  it('starts empty while its response is pending', async () => {
    let resolvePage:
      | ((page: IPaginatedResponse<ElementScene>) => void)
      | undefined;
    findAllPageMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePage = resolve;
      }),
    );

    renderScenes();
    expect(screen.getByText('0 scenes')).toBeVisible();
    await act(async () => {
      resolvePage?.(paginatedResponse([]));
    });
    expect(screen.getByText('0 scenes')).toBeVisible();
  });

  it('paints the cached scenes at once when coming back', async () => {
    findAllPageMock.mockResolvedValue(paginatedResponse([DUSK_PIER]));
    const client = createTestQueryClient();
    const firstVisit = renderScenes(client);
    expect(await screen.findByText('Dusk Pier')).toBeVisible();
    firstVisit.unmount();

    findAllPageMock.mockReturnValue(new Promise(() => {}));
    renderScenes(client);

    expect(screen.getByText('Dusk Pier')).toBeVisible();
  });

  it('never shows one organization’s scenes under another', async () => {
    findAllPageMock.mockResolvedValue(paginatedResponse([DUSK_PIER]));
    const client = createTestQueryClient();
    const firstVisit = renderScenes(client);
    expect(await screen.findByText('Dusk Pier')).toBeVisible();
    firstVisit.unmount();

    scope.organizationId = 'org-2';
    findAllPageMock.mockReturnValue(new Promise(() => {}));
    renderScenes(client);

    expect(screen.queryByText('Dusk Pier')).not.toBeInTheDocument();
  });
});
