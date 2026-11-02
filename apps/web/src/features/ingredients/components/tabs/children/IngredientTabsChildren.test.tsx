import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import {
  IngredientCategory,
  TransformationCategory,
} from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import IngredientTabsChildren from '@/features/ingredients/components/tabs/children/IngredientTabsChildren';

const { findChildrenMock } = vi.hoisted(() => ({
  findChildrenMock: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => {
  const service = { findChildren: findChildrenMock };
  const resolveService = async () => service;
  return { useAuthedService: () => resolveService };
});

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

vi.mock(
  '@/components/ingredients/list/media-grid/IngredientsMediaGrid',
  () => ({
    default: ({ items }: { items: IIngredient[] }) => (
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.id}</li>
        ))}
      </ul>
    ),
  }),
);

const ingredient = {
  category: IngredientCategory.VIDEO,
  id: 'ingredient-1',
} as IIngredient;

const captionedChild = {
  id: 'child-captioned',
  transformations: [TransformationCategory.CAPTIONED],
} as IIngredient;

describe('IngredientTabsChildren', () => {
  beforeEach(() => {
    findChildrenMock.mockReset();
  });

  it('shows the skeleton while the children load', () => {
    findChildrenMock.mockReturnValue(new Promise(() => {}));

    render(<IngredientTabsChildren ingredient={ingredient} />, {
      wrapper: queryClientWrapper(),
    });

    expect(
      screen.getByRole('status', { name: 'Loading child assets' }),
    ).toBeInTheDocument();
  });

  it('lists the captioned versions once loaded', async () => {
    findChildrenMock.mockResolvedValue([captionedChild]);

    render(<IngredientTabsChildren ingredient={ingredient} />, {
      wrapper: queryClientWrapper(),
    });

    expect(await screen.findByText('child-captioned')).toBeInTheDocument();
    expect(screen.getByText(/Captioned Versions \(1\)/)).toBeInTheDocument();
  });

  it('says so when the asset has no children', async () => {
    findChildrenMock.mockResolvedValue([]);

    render(<IngredientTabsChildren ingredient={ingredient} />, {
      wrapper: queryClientWrapper(),
    });

    expect(
      await screen.findByText('No child assets found'),
    ).toBeInTheDocument();
  });

  it('paints the children it already loaded straight away when you come back', async () => {
    findChildrenMock.mockResolvedValue([captionedChild]);
    const client = createTestQueryClient();
    const firstVisit = render(
      <IngredientTabsChildren ingredient={ingredient} />,
      { wrapper: queryClientWrapper(client) },
    );
    expect(await screen.findByText('child-captioned')).toBeInTheDocument();
    firstVisit.unmount();

    findChildrenMock.mockReturnValue(new Promise(() => {}));
    render(<IngredientTabsChildren ingredient={ingredient} />, {
      wrapper: queryClientWrapper(client),
    });

    expect(screen.getByText('child-captioned')).toBeInTheDocument();
    expect(
      screen.queryByRole('status', { name: 'Loading child assets' }),
    ).not.toBeInTheDocument();
  });
});
