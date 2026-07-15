import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudioPageContent from './StudioPageContent';
import '@testing-library/jest-dom/vitest';

const replaceMock = vi.fn();

const navigationState = vi.hoisted(() => ({
  searchType: null as string | null,
  type: 'image' as string | undefined,
}));

const enabledCategoriesState = vi.hoisted(() => ({
  defaultCategory: 'video',
  enabledCategories: ['image', 'video'],
  isEnabled: vi.fn(() => false),
  isLoading: false,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ type: navigationState.type }),
  usePathname: () => `/default/default/studio/${navigationState.type}`,
  useRouter: () => ({
    prefetch: vi.fn(),
    replace: replaceMock,
  }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'type' ? navigationState.searchType : null),
    toString: () => '',
  }),
}));

vi.mock(
  '@hooks/data/organization/use-enabled-categories/use-enabled-categories',
  () => ({
    STUDIO_CATEGORY_CONFIG: [
      { category: 'image', param: 'image' },
      { category: 'video', param: 'video' },
      { category: 'music', param: 'music' },
      { category: 'avatar', param: 'avatar' },
    ],
    categoryToParam: (category: string) => category,
    paramToCategory: (param?: string | null) => param ?? 'image',
    useEnabledCategories: () => enabledCategoriesState,
  }),
);

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/default/default${path}`,
  }),
}));

vi.mock('@pages/studio/generate', () => ({
  default: () => <div data-testid="studio-generate-layout" />,
}));

vi.mock('./GenerationFeatureGuard', () => ({
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
    enabledCategoriesState.enabledCategories = ['image', 'video'];
    enabledCategoriesState.isEnabled.mockReturnValue(false);
    enabledCategoriesState.isLoading = false;
  });

  it('should render without crashing', () => {
    const { container } = render(<StudioPageContent />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders direct navigation for enabled Studio modes', () => {
    render(<StudioPageContent />);

    expect(screen.getByRole('link', { name: 'Image' })).toHaveAttribute(
      'href',
      '/default/default/studio/image',
    );
    expect(screen.getByRole('link', { name: 'Video' })).toHaveAttribute(
      'href',
      '/default/default/studio/video',
    );
    expect(screen.queryByRole('link', { name: 'Music' })).toBeNull();
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
