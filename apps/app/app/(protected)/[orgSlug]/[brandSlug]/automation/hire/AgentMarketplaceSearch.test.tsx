// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AgentMarketplaceSearch from './AgentMarketplaceSearch';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

vi.mock('@pages/agents/content-team/content-team-presets', () => ({
  CONTENT_TEAM_ROLE_PRESETS: [
    { teamGroup: 'Production' },
    { teamGroup: 'Editorial' },
    { teamGroup: 'Editorial' },
  ],
}));

function renderSearch(
  overrides: Partial<Parameters<typeof AgentMarketplaceSearch>[0]> = {},
) {
  const onCategoryChange = vi.fn();
  const onSearchQueryChange = vi.fn();
  render(
    <AgentMarketplaceSearch
      category="all"
      onCategoryChange={onCategoryChange}
      onSearchQueryChange={onSearchQueryChange}
      searchQuery=""
      {...overrides}
    />,
  );
  return { onCategoryChange, onSearchQueryChange };
}

describe('AgentMarketplaceSearch', () => {
  it('reports what the user types', () => {
    const { onSearchQueryChange } = renderSearch();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search agents' }), {
      target: { value: 'copy' },
    });

    expect(onSearchQueryChange).toHaveBeenCalledWith('copy');
  });

  it('carries the team Filters menu inside the field, one entry per team', async () => {
    const user = userEvent.setup();
    const { onCategoryChange } = renderSearch();

    const field = screen
      .getByRole('textbox', { name: 'Search agents' })
      .closest('div')?.parentElement as HTMLElement;
    await user.click(within(field).getByRole('button', { name: /^Filters/ }));
    screen.getByRole('menuitem', { name: /^Team/ }).focus();
    await user.keyboard('{ArrowRight}');

    expect(
      await screen.findByRole('menuitemradio', { name: 'Production' }),
    ).toBeVisible();
    expect(
      screen.getAllByRole('menuitemradio', { name: 'Editorial' }),
    ).toHaveLength(1);
    await user.click(screen.getByRole('menuitemradio', { name: 'Editorial' }));

    expect(onCategoryChange).toHaveBeenCalledWith('Editorial');
  });
});
