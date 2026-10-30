import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import CampaignFormPage from '@/features/campaigns/form/CampaignFormPage';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  push: vi.fn(),
  invalidate: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brands: [{ id: 'brand-1', label: 'Brand' }] }),
}));
vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => ({
    brandId: 'brand-1',
    organizationId: 'org-1',
    isReady: true,
    pageScope: 'brand',
  }),
  isBrandResourceReady: () => true,
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/org/brand${path}` }),
}));
vi.mock('@/features/campaigns/hooks/use-campaign', () => ({
  useCampaign: () => ({
    campaign: undefined,
    isLoading: false,
    isUnavailable: false,
  }),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ create: mocks.create }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: mocks.error, success: mocks.success }),
  },
}));
vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({
    useGalleryModal: () => ({ openGallery: vi.fn() }),
  }),
);
vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

it('reuses the same campaign create identity after a lost response and preserves creative context', async () => {
  mocks.create
    .mockRejectedValueOnce(new Error('Response lost'))
    .mockResolvedValueOnce({ id: 'campaign-1' });
  render(<CampaignFormPage />);
  fireEvent.change(screen.getByLabelText('columns.name'), {
    target: { value: 'Launch' },
  });
  fireEvent.change(screen.getByLabelText('context.tone'), {
    target: { value: 'Candid' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'create' }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('saveFailed'));
  fireEvent.click(screen.getByRole('button', { name: 'create' }));
  await waitFor(() => expect(mocks.push).toHaveBeenCalled());
  const first = mocks.create.mock.calls[0]?.[0];
  const retry = mocks.create.mock.calls[1]?.[0];
  expect(first).toMatchObject({
    brandId: 'brand-1',
    name: 'Launch',
    tone: 'Candid',
    assetIds: [],
  });
  expect(first.idempotencyKey).toEqual(expect.any(String));
  expect(retry.idempotencyKey).toBe(first.idempotencyKey);
});
