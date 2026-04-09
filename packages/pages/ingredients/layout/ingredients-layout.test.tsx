import { IngredientStatus, PageScope } from '@genfeedai/enums';
import IngredientsLayout from '@pages/ingredients/layout/ingredients-layout';
import { render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const replaceSpy = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({ onClick }: { onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      Upload
    </button>
  ),
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
    description,
    label,
    right,
  }: {
    children?: ReactNode;
    description?: ReactNode;
    label?: ReactNode;
    right?: ReactNode;
  }) => (
    <div>
      <div>{label}</div>
      <div>{description}</div>
      <div>{right}</div>
      <div>{children}</div>
    </div>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/library/videos'),
  useRouter: vi.fn(() => ({
    replace: replaceSpy,
  })),
  useSearchParams: vi.fn(() => mockSearchParams),
}));

describe('IngredientsLayout', () => {
  beforeEach(() => {
    replaceSpy.mockReset();
    mockSearchParams = new URLSearchParams();
    window.history.replaceState({}, '', '/library/videos');
  });

  it('writes default video statuses as repeated query keys', async () => {
    render(
      <IngredientsLayout
        defaultType="videos"
        hideTypeTabs
        scope={PageScope.BRAND}
      />,
    );

    await waitFor(() => {
      expect(replaceSpy).toHaveBeenCalledWith(
        `/library/videos?status=${IngredientStatus.GENERATED}&status=${IngredientStatus.PROCESSING}&status=${IngredientStatus.VALIDATED}`,
        { scroll: false },
      );
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
});
