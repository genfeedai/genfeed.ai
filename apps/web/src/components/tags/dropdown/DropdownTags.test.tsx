import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { TagCategory } from '@genfeedai/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DropdownTags from '@/components/tags/dropdown/DropdownTags';

const mocks = vi.hoisted(() => {
  const findAll = vi.fn();
  const service = { findAll };
  return {
    brandId: 'brand_1',
    findAll,
    getService: async () => service,
  };
});

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: mocks.brandId }),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@genfeedai/services/content/tags.service', () => ({
  TagsService: { getInstance: () => ({}) },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: vi.fn(), success: vi.fn() }),
  },
}));

const launchTag = { id: 'tag-1', label: 'Launch' };

describe('DropdownTags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brandId = 'brand_1';
    mocks.findAll.mockResolvedValue([launchTag]);
  });

  it('reads nothing until it is opened', () => {
    render(<DropdownTags selectedTags={[]} onChange={vi.fn()} />, {
      wrapper: queryClientWrapper(),
    });

    expect(
      screen.getByRole('button', { name: 'Manage tags' }),
    ).toBeInTheDocument();
    expect(mocks.findAll).not.toHaveBeenCalled();
  });

  it('lists the brand’s tags once opened', async () => {
    render(
      <DropdownTags
        scope={TagCategory.INGREDIENT}
        selectedTags={[]}
        onChange={vi.fn()}
      />,
      { wrapper: queryClientWrapper() },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Manage tags' }));

    expect(
      await screen.findByRole('button', { name: 'Launch' }),
    ).toBeInTheDocument();
    expect(mocks.findAll).toHaveBeenCalledWith(
      { brand: 'brand_1', category: TagCategory.INGREDIENT },
      expect.any(AbortSignal),
    );
  });

  it('paints the cached tags at once when opened again on a return visit', async () => {
    const client = createTestQueryClient();
    const firstVisit = render(
      <DropdownTags selectedTags={['tag-1']} onChange={vi.fn()} />,
      { wrapper: queryClientWrapper(client) },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Manage tags' }));
    await screen.findByRole('button', { name: 'Launch' });
    firstVisit.unmount();

    mocks.findAll.mockReturnValue(new Promise(() => {}));
    render(<DropdownTags selectedTags={['tag-1']} onChange={vi.fn()} />, {
      wrapper: queryClientWrapper(client),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Manage tags' }));

    expect(screen.getByRole('button', { name: 'Launch' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Launch' })).toBeVisible();
    expect(screen.queryByText('Loading tags…')).not.toBeInTheDocument();
  });

  it('never shows one brand’s cached tags for another brand', async () => {
    const client = createTestQueryClient();
    const firstVisit = render(
      <DropdownTags selectedTags={[]} onChange={vi.fn()} />,
      { wrapper: queryClientWrapper(client) },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Manage tags' }));
    await screen.findByRole('button', { name: 'Launch' });
    firstVisit.unmount();

    mocks.brandId = 'brand_2';
    mocks.findAll.mockReturnValue(new Promise(() => {}));
    render(<DropdownTags selectedTags={[]} onChange={vi.fn()} />, {
      wrapper: queryClientWrapper(client),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Manage tags' }));

    expect(screen.getByText('Loading tags…')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Launch' }),
    ).not.toBeInTheDocument();
  });
});
