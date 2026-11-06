import '@testing-library/jest-dom/vitest';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { TurboProjectItemStatus } from '@genfeedai/contracts';
import type { ITurboProjectItem } from '@genfeedai/contracts/interfaces';
import type { QueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TurboProjectItemCard from './TurboProjectItemCard';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
  return { useLocale: () => 'en', useTranslations: translateFromCatalog };
});
const mocks = vi.hoisted(() => ({ findByIds: vi.fn() }));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));
vi.mock('@services/content/ingredients.service', () => ({
  IngredientsService: {
    getInstance: () => ({ findByIds: mocks.findByIds }),
  },
}));
vi.mock('@ui/collection/CollectionItemActions', () => ({
  default: ({
    overflow,
  }: {
    overflow: Array<{ id: string; label: string; onSelect: () => void }>;
  }): ReactNode => (
    <div>
      {overflow.map((action) => (
        <button key={action.id} type="button" onClick={action.onSelect}>
          {action.label}
        </button>
      ))}
    </div>
  ),
}));

const readyItem = {
  id: 'item-1',
  position: 0,
  projectId: 'project-1',
  retryCount: 0,
  reviewItemId: 'review-item-1',
  scheduledTargets: [],
  status: TurboProjectItemStatus.READY,
} as ITurboProjectItem;

function renderCard(
  onReview = vi.fn(),
  item: ITurboProjectItem = readyItem,
  client: QueryClient = createTestQueryClient(),
) {
  const view = render(
    <TurboProjectItemCard
      item={item}
      isDraft={false}
      disabled={false}
      onRemove={vi.fn()}
      onRetry={vi.fn()}
      onCaption={vi.fn()}
      onReview={onReview}
    />,
    { wrapper: queryClientWrapper(client) },
  );
  return { onReview, unmount: view.unmount };
}

describe('TurboProjectItemCard rejection', () => {
  it('asks why before rejecting and sends the reason with the decision', () => {
    const { onReview } = renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onReview).not.toHaveBeenCalled();

    fireEvent.change(
      screen.getByRole('textbox', {
        name: 'Why are you rejecting this? (optional)',
      }),
      { target: { value: '  Too salesy  ' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reject draft' }));

    expect(onReview).toHaveBeenCalledWith('rejected', 'Too salesy');
  });

  it('rejects without a reason when none is typed', () => {
    const { onReview } = renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject draft' }));

    expect(onReview).toHaveBeenCalledWith('rejected', undefined);
  });

  it('cancels without reviewing', () => {
    const { onReview } = renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onReview).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'Reject draft' }),
    ).not.toBeInTheDocument();
  });
});

describe('TurboProjectItemCard media', () => {
  const outputItem = {
    ...readyItem,
    idea: { hook: 'Morning routine reel' },
    outputIngredientId: 'ingredient-1',
  } as ITurboProjectItem;

  beforeEach(() => {
    mocks.findByIds.mockReset();
    mocks.findByIds.mockResolvedValue([
      {
        category: 'IMAGE',
        id: 'ingredient-1',
        ingredientUrl: 'https://cdn.example.test/ingredient-1.png',
      },
    ]);
  });

  it('paints the cached preview at once when the project reopens', async () => {
    const client = createTestQueryClient();
    const firstVisit = renderCard(vi.fn(), outputItem, client);
    expect(
      await screen.findByRole('img', { name: 'Morning routine reel' }),
    ).toBeInTheDocument();
    firstVisit.unmount();

    mocks.findByIds.mockReturnValue(new Promise(() => {}));
    renderCard(vi.fn(), outputItem, client);

    expect(
      screen.getByRole('img', { name: 'Morning routine reel' }),
    ).toBeInTheDocument();
  });

  it('reads the output by id through the batch route', async () => {
    renderCard(vi.fn(), outputItem);

    expect(
      await screen.findByRole('img', { name: 'Morning routine reel' }),
    ).toBeInTheDocument();
    expect(mocks.findByIds).toHaveBeenCalledWith(['ingredient-1']);
  });

  it('shows no preview when the output no longer exists', async () => {
    mocks.findByIds.mockResolvedValue([]);
    renderCard(vi.fn(), outputItem);

    expect(
      await screen.findByRole('heading', { name: 'Morning routine reel' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: 'Morning routine reel' }),
    ).not.toBeInTheDocument();
  });

  it('never shows one output’s preview on another item', async () => {
    const client = createTestQueryClient();
    const firstVisit = renderCard(vi.fn(), outputItem, client);
    expect(
      await screen.findByRole('img', { name: 'Morning routine reel' }),
    ).toBeInTheDocument();
    firstVisit.unmount();

    mocks.findByIds.mockReturnValue(new Promise(() => {}));
    renderCard(
      vi.fn(),
      { ...outputItem, outputIngredientId: 'ingredient-2' },
      client,
    );

    expect(
      screen.queryByRole('img', { name: 'Morning routine reel' }),
    ).not.toBeInTheDocument();
  });
});
