import DeskFilterRail from '@pages/trends/desk/desk-filter-rail';
import { fireEvent, render, screen } from '@testing-library/react';
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

describe('Discovery dropdown filters', () => {
  it('offers each platform inside one dropdown and clears multiple filters atomically', async () => {
    const props = renderFilters();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Platforms' }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(
      await screen.findByRole('menuitemcheckbox', { name: /instagram/ }),
    );
    expect(props.onTogglePlatform).toHaveBeenCalledWith('instagram');
    fireEvent.click(
      screen.getByRole('menuitemcheckbox', { name: 'All platforms' }),
    );
    expect(props.onClearPlatforms).toHaveBeenCalledOnce();
  });
  it('exposes content type and sorting as dropdown controls', () => {
    renderFilters();
    expect(
      screen.queryByRole('combobox', { name: 'Source' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Content type' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument();
  });
});
