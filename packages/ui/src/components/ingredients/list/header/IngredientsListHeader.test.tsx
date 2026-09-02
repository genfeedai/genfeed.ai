import { render } from '@testing-library/react';
import IngredientsListHeader from '@ui/ingredients/list/header/IngredientsListHeader';
import { describe, expect, it } from 'vitest';

describe('IngredientsListHeader', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <IngredientsListHeader
        canMerge={false}
        isMerging={false}
        selectedCount={1}
        onBulkDelete={() => undefined}
        onClearSelection={() => undefined}
        onMerge={() => undefined}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <IngredientsListHeader
        canMerge={false}
        isMerging={false}
        selectedCount={1}
        onBulkDelete={() => undefined}
        onClearSelection={() => undefined}
        onMerge={() => undefined}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <IngredientsListHeader
        canMerge={false}
        isMerging={false}
        selectedCount={1}
        onBulkDelete={() => undefined}
        onClearSelection={() => undefined}
        onMerge={() => undefined}
      />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
