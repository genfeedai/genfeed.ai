import '@testing-library/jest-dom/vitest';
import type { ITrendVideo } from '@genfeedai/interfaces';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import type { ChangeEvent, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HookRemixModal from './HookRemixModal';

const mocks = vi.hoisted(() => ({
  closeModal: vi.fn(),
  createHookRemix: vi.fn(),
  findAllVideos: vi.fn(),
  getHookRemixInstance: vi.fn(() => 'hook-remix-service'),
  getLegacyIngredientsInstance: vi.fn(() => 'legacy-video-service'),
  getVideosInstance: vi.fn(() => 'videos-service'),
  openModal: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    brands: [{ id: 'brand-1', label: 'Default Brand' }],
  }),
}));

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  closeModal: mocks.closeModal,
  openModal: mocks.openModal,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () => {
    const service = factory('test-token');

    return service === 'videos-service' || service === 'legacy-video-service'
      ? { findAll: mocks.findAllVideos }
      : { createHookRemix: mocks.createHookRemix };
  },
}));

vi.mock('@services/content/ingredients.service', () => ({
  IngredientsService: { getInstance: mocks.getLegacyIngredientsInstance },
}));

vi.mock('@services/ingredients/videos.service', () => ({
  VideosService: { getInstance: mocks.getVideosInstance },
}));

vi.mock('@services/hook-remix/hook-remix.service', () => ({
  HookRemixService: { getInstance: mocks.getHookRemixInstance },
}));

vi.mock('@ui/modals/actions/ModalActions', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    isDisabled,
    label,
    onClick,
  }: {
    isDisabled?: boolean;
    label?: ReactNode;
    onClick?: () => void;
  }) => (
    <button disabled={isDisabled} onClick={onClick} type="button">
      {label}
    </button>
  ),
}));

vi.mock('@ui/primitives/field', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@ui/primitives/select', () => ({
  SelectField: ({
    children,
    isDisabled,
    name,
    onChange,
    value,
  }: {
    children: ReactNode;
    isDisabled?: boolean;
    name: string;
    onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
    value?: string;
  }) => (
    <select disabled={isDisabled} name={name} onChange={onChange} value={value}>
      {children}
    </select>
  ),
}));

vi.mock('@ui/primitives/slider', () => ({
  Slider: () => <div data-testid="slider" />,
}));

const trendVideo: ITrendVideo = {
  creatorHandle: 'creator',
  engagementRate: 0,
  id: 'trend-video-1',
  platform: 'tiktok',
  velocity: 0,
  viralScore: 0,
};

describe('HookRemixModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAllVideos.mockResolvedValue([]);
  });

  it('does not fetch CTA clips while the modal is closed', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <HookRemixModal isOpen={false} video={null} />
      </QueryClientProvider>,
    );

    await Promise.resolve();

    expect(mocks.getLegacyIngredientsInstance).not.toHaveBeenCalled();
    expect(mocks.getVideosInstance).not.toHaveBeenCalled();
    expect(mocks.findAllVideos).not.toHaveBeenCalled();
  });

  it('loads CTA clips from the canonical videos service when opened', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <HookRemixModal isOpen video={trendVideo} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(mocks.getVideosInstance).toHaveBeenCalledWith('test-token');
      expect(mocks.findAllVideos).toHaveBeenCalledWith({ brand: 'brand-1' });
    });
  });
});
