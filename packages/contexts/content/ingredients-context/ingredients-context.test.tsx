import { IngredientsProvider } from '@genfeedai/contexts/content/ingredients-context/ingredients-context';
import type { IIngredientsContextValue } from '@genfeedai/contracts/interfaces/providers/providers.interface';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('IngredientsContext', () => {
  const baseValue: IIngredientsContextValue = {
    filters: {
      format: '',
      provider: '',
      search: '',
      status: '',
      type: '',
    },
    isRefreshing: false,
    query: {},
    setFilters: vi.fn(),
    setIsRefreshing: vi.fn(),
    setQuery: vi.fn(),
  };

  it('should render without crashing', () => {
    const { container } = render(
      <IngredientsProvider value={baseValue}>
        <div data-testid="child" />
      </IngredientsProvider>,
    );
    expect(container.firstChild).toBeInTheDocument();
  });
});
