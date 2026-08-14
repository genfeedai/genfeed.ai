import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModelSelectorProviderSidebar from '@ui/dropdowns/model-selector/ModelSelectorProviderSidebar';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  renderTooltipProvider: vi.fn(),
}));

// Keep the real Radix provider — only count how many the rail mounts.
vi.mock('@ui/primitives/tooltip', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@ui/primitives/tooltip')>();

  return {
    ...actual,
    TooltipProvider: (
      props: React.ComponentProps<typeof actual.TooltipProvider>,
    ) => {
      mocks.renderTooltipProvider();
      return <actual.TooltipProvider {...props} />;
    },
  };
});

describe('ModelSelectorProviderSidebar', () => {
  const brands = [
    { color: '#d97757', count: 4, label: 'Anthropic', slug: 'anthropic' },
    { color: '#10a37f', count: 6, label: 'OpenAI', slug: 'openai' },
  ];

  function renderSidebar() {
    return render(
      <ModelSelectorProviderSidebar
        brands={brands}
        activeBrand={null}
        onBrandSelect={vi.fn()}
        hasFavorites={false}
      />,
    );
  }

  beforeEach(() => {
    mocks.renderTooltipProvider.mockClear();
  });

  it('labels a rail button while it holds keyboard focus', async () => {
    const user = userEvent.setup();
    renderSidebar();

    expect(screen.queryByText('All providers')).not.toBeInTheDocument();

    await user.tab();

    expect(screen.getByRole('button', { name: 'All providers' })).toHaveFocus();
    await waitFor(() =>
      expect(screen.getAllByText('All providers').length).toBeGreaterThan(0),
    );
  });

  it('hides the label when focus leaves the button', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.tab();
    await waitFor(() =>
      expect(screen.getAllByText('All providers').length).toBeGreaterThan(0),
    );

    await user.tab();

    expect(screen.getByRole('button', { name: 'Anthropic' })).toHaveFocus();
    await waitFor(() =>
      expect(screen.queryAllByText('All providers')).toHaveLength(0),
    );
  });

  it('does not paint a vertical scrollbar in the provider rail', () => {
    renderSidebar();

    const rail = screen.getByRole('navigation', {
      name: 'Filter by model provider',
    });

    expect(rail.className).toContain('overflow-x-hidden');
    expect(rail.className).toContain('overflow-y-auto');
    expect(rail.className).toMatch(/scrollbar-width:none|scrollbar-none/);
  });

  it('mounts a single tooltip provider for the whole rail', () => {
    renderSidebar();

    expect(screen.getAllByRole('button').length).toBeGreaterThan(1);
    expect(mocks.renderTooltipProvider).toHaveBeenCalledTimes(1);
  });

  it('renders the local GenFeed mark instead of a letter tile', () => {
    render(
      <ModelSelectorProviderSidebar
        brands={[
          { color: '#3B82F6', count: 8, label: 'GenFeed', slug: 'genfeed-ai' },
        ]}
        activeBrand={null}
        onBrandSelect={vi.fn()}
        hasFavorites={false}
      />,
    );

    expect(screen.getByTestId('model-provider-rail-icon')).toBeInTheDocument();
    expect(screen.queryByText('G')).not.toBeInTheDocument();
  });
});
