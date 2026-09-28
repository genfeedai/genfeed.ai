import { ViewType } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import CollectionView from '@ui/collection/CollectionView';
import { describe, expect, it } from 'vitest';

const ITEMS = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
];

function renderView(
  props: Partial<Parameters<typeof CollectionView<(typeof ITEMS)[number]>>[0]>,
) {
  return render(
    <CollectionView
      data-testid="collection"
      getItemKey={(item) => item.id}
      items={ITEMS}
      renderGridItem={(item) => <div data-testid="card">{item.name}</div>}
      renderListItem={(item) => <div data-testid="row">{item.name}</div>}
      view={ViewType.LIST}
      {...props}
    />,
  );
}

describe('CollectionView', () => {
  it('renders rows inside one list surface in list view', () => {
    renderView({ view: ViewType.LIST });

    expect(screen.getAllByTestId('row')).toHaveLength(2);
    expect(screen.queryByTestId('card')).not.toBeInTheDocument();
    expect(screen.getByTestId('collection')).toHaveClass(
      'rounded-card',
      'shadow-border',
    );
  });

  it('renders cards inside the container-query grid in grid view', () => {
    renderView({ view: ViewType.GRID });

    expect(screen.getAllByTestId('card')).toHaveLength(2);
    expect(screen.queryByTestId('row')).not.toBeInTheDocument();
    expect(screen.getByTestId('collection')).toHaveClass('@container');
  });

  it('mirrors the active view in its loading skeleton', () => {
    const { rerender } = renderView({ isLoading: true, view: ViewType.LIST });
    expect(screen.getByTestId('list-rows-skeleton')).toBeInTheDocument();

    rerender(
      <CollectionView
        getItemKey={(item) => item.id}
        isLoading
        items={ITEMS}
        renderGridItem={(item) => <div>{item.name}</div>}
        renderListItem={(item) => <div>{item.name}</div>}
        skeletonCount={3}
        view={ViewType.GRID}
      />,
    );
    expect(screen.queryByTestId('list-rows-skeleton')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('skeleton-card')).toHaveLength(3);
  });

  it('renders the empty state when there are no items', () => {
    renderView({ emptyState: <p>No agents yet</p>, items: [] });

    expect(screen.getByText('No agents yet')).toBeInTheDocument();
    expect(screen.queryByTestId('collection')).not.toBeInTheDocument();
  });
});
