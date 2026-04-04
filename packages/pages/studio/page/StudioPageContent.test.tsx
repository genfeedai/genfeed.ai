import StudioPageContent from '@pages/studio/page/StudioPageContent';
import { render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

const replaceMock = vi.fn();

const navigationState = vi.hoisted(() => ({
  searchType: null as string | null,
  type: 'image' as string | undefined,
}));

const enabledCategoriesState = vi.hoisted(() => ({
  defaultCategory: 'video',
  isEnabled: vi.fn(() => false),
  isLoading: false,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ type: navigationState.type }),
  useRouter: () => ({
    replace: replaceMock,
  }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'type' ? navigationState.searchType : null),
  }),
}));

vi.mock(
  '@hooks/data/organization/use-enabled-categories/use-enabled-categories',
  () => ({
    categoryToParam: (category: string) => category,
    paramToCategory: (param?: string | null) => param ?? 'image',
    useEnabledCategories: () => enabledCategoriesState,
  }),
);

vi.mock('@pages/studio/generate', () => ({
  default: () => <div data-testid="studio-generate-layout" />,
}));

vi.mock('@pages/studio/guards/GenerationFeatureGuard', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@ui/loading/fallback/LazyLoadingFallback', () => ({
  default: () => <div data-testid="lazy-fallback" />,
}));

describe('StudioPageContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigationState.type = 'image';
    navigationState.searchType = null;
    enabledCategoriesState.defaultCategory = 'video';
    enabledCategoriesState.isEnabled.mockReturnValue(false);
    enabledCategoriesState.isLoading = false;
  });

  it('should render without crashing', () => {
    const { container } = render(<StudioPageContent />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('resets redirect guard when category changes so redirects can fire again', async () => {
    const { rerender } = render(<StudioPageContent />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/studio/video', {
        scroll: false,
      });
    });

    navigationState.type = 'music';
    enabledCategoriesState.defaultCategory = 'image';

    rerender(<StudioPageContent />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/studio/image', {
        scroll: false,
      });
    });

    expect(replaceMock).toHaveBeenCalledTimes(2);
  });
});
