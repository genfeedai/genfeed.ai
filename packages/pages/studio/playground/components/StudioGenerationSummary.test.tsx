import StudioGenerationSummary from '@pages/studio/playground/components/StudioGenerationSummary';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@ui/primitives/button';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/config/license', () => ({
  shouldShowCreditsNav: () => true,
}));
vi.mock(
  '@genfeedai/hooks/data/billing/use-topbar-balances/use-topbar-balances',
  () => ({
    useTopbarBalances: () => ({
      genfeedBalance: 5397,
      isLoaded: true,
      isLoading: false,
    }),
  }),
);
vi.mock(
  '@genfeedai/hooks/ui/use-desktop-runtime-context/use-desktop-runtime-context',
  () => ({
    useDesktopRuntimeContext: () => ({ status: 'web', context: null }),
  }),
);
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('Studio submit credit tooltip', () => {
  beforeEach(() => vi.useRealTimers());

  it('keeps credits out of the toolbar and reveals them on keyboard focus', async () => {
    const user = userEvent.setup();
    render(
      <StudioGenerationSummary
        label="Generate"
        type="image"
        estimate={{ status: 'estimated', credits: 12 }}
      >
        <Button withWrapper={false}>Generate</Button>
      </StudioGenerationSummary>,
    );
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.queryByText('~12')).not.toBeInTheDocument();
    await user.tab();
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toMatch(/~12\s*\/\s*5,397/);
    expect(screen.getByRole('button', { name: 'Generate' })).toHaveAttribute(
      'aria-describedby',
      tooltip.id,
    );
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows the same estimate when the submit button is hovered', async () => {
    render(
      <StudioGenerationSummary
        label="Generate"
        type="image"
        estimate={{ status: 'estimated', credits: 12 }}
      >
        <Button withWrapper={false}>Generate</Button>
      </StudioGenerationSummary>,
    );
    fireEvent.pointerMove(screen.getByRole('button', { name: 'Generate' }), {
      pointerType: 'mouse',
    });
    expect((await screen.findByRole('tooltip')).textContent).toMatch(
      /~12\s*\/\s*5,397/,
    );
  });

  it('keeps a blocked submit focusable and explains the pending estimate', async () => {
    const user = userEvent.setup();
    render(
      <StudioGenerationSummary
        label="Generate"
        type="image"
        estimate={{ status: 'loading', credits: null }}
      >
        <Button aria-disabled withWrapper={false}>
          Generate
        </Button>
      </StudioGenerationSummary>,
    );
    await user.tab();
    expect(screen.getByRole('button', { name: 'Generate' })).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Loading estimate',
    );
  });

  it('allows hovering the wrapper while a generation is busy', async () => {
    render(
      <StudioGenerationSummary
        label="Generate"
        type="image"
        isDisabled
        estimate={{ status: 'estimated', credits: 12 }}
      >
        <Button isDisabled withWrapper={false}>
          Generate
        </Button>
      </StudioGenerationSummary>,
    );
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
    fireEvent.pointerMove(screen.getByRole('group', { name: 'Generate' }), {
      pointerType: 'mouse',
    });
    expect((await screen.findByRole('tooltip')).textContent).toMatch(
      /~12\s*\/\s*5,397/,
    );
  });

  it('focuses the busy summary from the keyboard and shows the estimate', async () => {
    const user = userEvent.setup();
    render(
      <StudioGenerationSummary
        label="Generate"
        type="image"
        isDisabled
        estimate={{ status: 'estimated', credits: 12 }}
      >
        <Button isDisabled withWrapper={false}>
          Generate
        </Button>
      </StudioGenerationSummary>,
    );
    const submit = screen.getByRole('button', { name: 'Generate' });
    expect(submit).toBeDisabled();
    await user.tab();
    expect(screen.getByRole('group', { name: 'Generate' })).toHaveFocus();
    expect(submit).toBeDisabled();
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toMatch(/~12\s*\/\s*5,397/);
  });
});
