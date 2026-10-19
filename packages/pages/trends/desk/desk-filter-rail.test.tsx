import DeskFilterRail from '@pages/trends/desk/desk-filter-rail';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

function renderFilters() {
  const props = {
    activePlatforms: new Set(['youtube']),
    contentType: 'all' as const,
    sort: 'velocity' as const,
    items: [],
    summary: {
      connectedPlatforms: ['youtube'],
      lockedPlatforms: ['instagram'],
      totalItems: 0,
      totalTrends: 0,
    },
    onTogglePlatform: vi.fn(),
    onClearPlatforms: vi.fn(),
    onSort: vi.fn(),
    onContentTypeChange: vi.fn(),
  };
  render(<DeskFilterRail {...props} />);
  return props;
}

async function openFacet(name: RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /^Filters/ }));
  screen.getByRole('menuitem', { name }).focus();
  await user.keyboard('{ArrowRight}');
  return user;
}

describe('Discovery filter menu', () => {
  it('offers each platform inside one nested menu and toggles one at a time', async () => {
    const props = renderFilters();
    const user = await openFacet(/^Platforms/);
    await user.click(
      await screen.findByRole('menuitemcheckbox', { name: /instagram/ }),
    );
    expect(props.onTogglePlatform).toHaveBeenCalledWith('instagram');
    await user.click(screen.getByRole('menuitemcheckbox', { name: /youtube/ }));
    expect(props.onTogglePlatform).toHaveBeenCalledWith('youtube');
  });

  it('clears the platform and content type filters together', async () => {
    const props = renderFilters();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Clear filters' }));
    expect(props.onClearPlatforms).toHaveBeenCalledOnce();
    expect(props.onContentTypeChange).toHaveBeenCalledWith('all');
  });

  it('exposes content type and sorting as nested single choices', async () => {
    const props = renderFilters();
    const user = await openFacet(/^Content type/);
    await user.click(
      await screen.findByRole('menuitemradio', { name: 'Video' }),
    );
    expect(props.onContentTypeChange).toHaveBeenCalledWith('video');
    expect(
      screen.queryByRole('combobox', { name: 'Sort' }),
    ).not.toBeInTheDocument();
  });
});
