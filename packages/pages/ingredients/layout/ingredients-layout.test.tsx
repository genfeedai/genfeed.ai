import { IngredientStatus, PageScope } from '@genfeedai/contracts';
import IngredientsLayout from '@pages/ingredients/layout/ingredients-layout';
import { render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { translationNamespaceSpy } = vi.hoisted(() => ({
  translationNamespaceSpy: vi.fn(),
}));
const replaceSpy = vi.fn();
let mockSearchParams = new URLSearchParams();
let mockPathname = '/library/videos';

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({ onClick }: { onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      Upload
    </button>
  ),
}));

vi.mock('@ui/content/admin-filters/AdminOrgBrandUrlFilter', () => ({
  default: () => <div data-testid="admin-org-filter" />,
}));

vi.mock('@ui/buttons/refresh/button-refresh/ButtonRefresh', () => ({
  default: ({ onClick }: { onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      Refresh
    </button>
  ),
}));

vi.mock('@contexts/content/ingredients-context/ingredients-context', () => ({
  IngredientsProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock(
  '@contexts/content/ingredients-header-context/ingredients-header-context',
  () => ({
    IngredientsHeaderProvider: ({ children }: { children: ReactNode }) => (
      <>{children}</>
    ),
  }),
);

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brandId: 'brand-1',
    brands: [{ id: 'brand-1', label: 'Brand 1' }],
  })),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useUploadModal: vi.fn(() => ({
    openUpload: vi.fn(),
  })),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apps: {
      app: 'https://app.genfeed.ai',
    },
  },
}));

vi.mock('@ui/content/filters-button/FiltersButton', () => ({
  default: () => <div>Filters</div>,
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    headerTabs,
    label,
    right,
  }: {
    children?: ReactNode;
    headerTabs?: {
      activeTab: string;
      tabs: { href: string; label: string }[];
    };
    label?: ReactNode;
    right?: ReactNode;
  }) => (
    <div>
      <div>{label}</div>
      <nav data-active={headerTabs?.activeTab}>
        {headerTabs?.tabs.map((tab) => (
          <a key={tab.href} href={tab.href}>
            {tab.label}
          </a>
        ))}
      </nav>
      <div>{right}</div>
      <div>{children}</div>
    </div>
  ),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    translationNamespaceSpy(namespace);
    return (key: string) => ({ upload: 'Upload' })[key] ?? key;
  },
}));

vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({
    brandSlug: 'brand-1',
    orgSlug: 'org-1',
  })),
  usePathname: vi.fn(() => mockPathname),
  useRouter: vi.fn(() => ({
    replace: replaceSpy,
  })),
  useSearchParams: vi.fn(() => mockSearchParams),
}));

describe('IngredientsLayout', () => {
  beforeEach(() => {
    replaceSpy.mockReset();
    translationNamespaceSpy.mockClear();
    mockSearchParams = new URLSearchParams();
    mockPathname = '/library/videos';
    window.history.replaceState({}, '', '/library/videos');
  });

  it('uses the canonical catalog namespace for upload actions', () => {
    render(
      <IngredientsLayout
        defaultType="videos"
        hideTypeTabs
        scope={PageScope.BRAND}
      />,
    );
    expect(translationNamespaceSpy).toHaveBeenCalledWith(
      'pages.library.browser.toolbar',
    );
  });

  it('keeps default video statuses out of the URL on mount', async () => {
    render(
      <IngredientsLayout
        defaultType="videos"
        hideTypeTabs
        scope={PageScope.BRAND}
      />,
    );

    await waitFor(() => {
      expect(replaceSpy).not.toHaveBeenCalled();
    });
  });

  it('does not rewrite an already repeated status query on mount', async () => {
    mockSearchParams = new URLSearchParams([
      ['status', IngredientStatus.GENERATED],
      ['status', IngredientStatus.PROCESSING],
      ['status', IngredientStatus.VALIDATED],
    ]);
    window.history.replaceState(
      {},
      '',
      `/library/videos?status=${IngredientStatus.GENERATED}&status=${IngredientStatus.PROCESSING}&status=${IngredientStatus.VALIDATED}`,
    );

    render(
      <IngredientsLayout
        defaultType="videos"
        hideTypeTabs
        scope={PageScope.BRAND}
      />,
    );

    await waitFor(() => {
      expect(replaceSpy).not.toHaveBeenCalled();
    });
  });

  it('opens the admin library on All assets when no asset type is chosen', () => {
    window.history.replaceState({}, '', '/admin/content/ingredients');

    const { getByText } = render(
      <IngredientsLayout scope={PageScope.SUPERADMIN} />,
    );

    expect(getByText('Assets')).toBeTruthy();
  });

  it('keeps Videos as the fallback outside the admin scope', () => {
    window.history.replaceState({}, '', '/library');

    const { getAllByText } = render(
      <IngredientsLayout scope={PageScope.BRAND} />,
    );

    expect(getAllByText('Videos').length).toBeGreaterThan(0);
  });

  it('links the admin asset type tabs by path and keeps the filters', () => {
    mockPathname = '/admin/content/ingredients/images';
    mockSearchParams = new URLSearchParams('search=hero');

    const { container } = render(
      <IngredientsLayout scope={PageScope.SUPERADMIN} />,
    );

    const nav = container.querySelector('nav');
    expect(
      Array.from(nav?.querySelectorAll('a') ?? []).map((link) =>
        link.getAttribute('href'),
      ),
    ).toEqual([
      '/admin/content/ingredients?search=hero',
      '/admin/content/ingredients/videos?search=hero',
      '/admin/content/ingredients/images?search=hero',
      '/admin/content/ingredients/gifs?search=hero',
      '/admin/content/ingredients/musics?search=hero',
    ]);
    expect(nav?.getAttribute('data-active')).toBe(
      '/admin/content/ingredients/images?search=hero',
    );
  });
});
