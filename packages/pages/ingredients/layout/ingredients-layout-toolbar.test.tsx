import { PageScope } from '@genfeedai/contracts';
import IngredientsLayoutToolbar from '@pages/ingredients/layout/ingredients-layout-toolbar';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/demo/FUDNEWS${path}`,
  }),
}));

vi.mock('./library-asset-type-filter', () => ({
  default: () => <div data-testid="library-asset-type-filter" />,
}));

vi.mock('@ui/buttons/refresh/button-refresh/ButtonRefresh', () => ({
  default: () => <button type="button">Refresh</button>,
}));

vi.mock('@ui/content/filters-button/FiltersButton', () => ({
  default: () => <button type="button">Filters</button>,
}));

describe('IngredientsLayoutToolbar', () => {
  it('scopes Generate to the current brand instead of bare /agent/new', () => {
    render(
      <IngredientsLayoutToolbar
        config={{
          filterOptions: {},
          showGenerateLink: true,
          showUpload: false,
          showViewToggle: false,
          visibleFilters: {},
        }}
        filters={{
          format: '',
          provider: '',
          search: '',
          status: '',
          type: '',
        }}
        isRefreshing={false}
        scope={PageScope.BRAND}
        onFiltersChange={vi.fn()}
        onRefresh={vi.fn()}
        onUpload={vi.fn()}
      />,
    );

    expect(screen.getByRole('link', { name: /generate/i })).toHaveAttribute(
      'href',
      '/demo/FUDNEWS/agent/new',
    );
  });
});
