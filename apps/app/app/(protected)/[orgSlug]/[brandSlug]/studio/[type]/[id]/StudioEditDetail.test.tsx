import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudioEditDetail from './StudioEditDetail';
import '@testing-library/jest-dom';

vi.mock('@contexts/ui/asset-selection-context', () => ({
  useAssetSelection: vi.fn(() => ({
    setSelectedAsset: vi.fn(),
  })),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brandId: undefined,
  })),
}));

vi.mock('@hooks/data/elements/use-elements/use-elements', () => ({
  useElements: vi.fn(() => ({
    imageEditModels: [],
    videoEditModels: [],
  })),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: vi.fn(() => ({
    href: vi.fn((path: string) => path),
  })),
}));

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: vi.fn(() => ({
    subscribe: vi.fn(() => vi.fn()),
  })),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@hooks/data/resource/use-resource/use-resource', () => ({
  useResource: vi.fn(() => ({
    data: null,
    isLoading: false,
    refresh: vi.fn(),
  })),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

describe('StudioEditDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<StudioEditDetail ingredientId="item-123" />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
