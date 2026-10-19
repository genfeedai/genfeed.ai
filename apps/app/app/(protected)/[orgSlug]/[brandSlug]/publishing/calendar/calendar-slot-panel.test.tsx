import {
  ContextSidebarOutlet,
  ContextSidebarProvider,
} from '@contexts/ui/context-sidebar-context';
import { CalendarSlotState } from '@genfeedai/contracts';
import type { ICalendarSlot } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CalendarSlotPanel from './calendar-slot-panel';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return {
    useTranslations: (namespace: string) => translateFromCatalog(namespace),
  };
});

function buildSlot(overrides: Partial<ICalendarSlot> = {}): ICalendarSlot {
  return {
    brandId: 'brand-1',
    cadenceId: 'cadence-1',
    credentialId: 'credential-1',
    format: 'reel',
    generatedItemId: null,
    generatedItemType: null,
    id: 'slot-1',
    identityKey: 'slot-1',
    instant: '2026-03-12T10:00:00.000Z',
    lastFailureReason: null,
    resolvedBrief: 'Ship in public',
    state: CalendarSlotState.MISSING,
    timezone: 'UTC',
    ...overrides,
  } as ICalendarSlot;
}

function renderPanel(
  slot: ICalendarSlot | null,
  handlers: Partial<Parameters<typeof CalendarSlotPanel>[0]> = {},
) {
  return render(
    <ContextSidebarProvider>
      <CalendarSlotPanel
        isPending={false}
        onCancel={vi.fn()}
        onClose={vi.fn()}
        onGenerate={vi.fn()}
        onSkip={vi.fn()}
        onWrite={vi.fn()}
        slot={slot}
        {...handlers}
      />
      <ContextSidebarOutlet testId="rail" />
    </ContextSidebarProvider>,
  );
}

describe('CalendarSlotPanel', () => {
  it('renders nothing while no slot is selected', () => {
    renderPanel(null);

    expect(screen.queryByTestId('calendar-slot-panel')).not.toBeInTheDocument();
  });

  it('shows the slot in the right sidebar and generates with a brief override', () => {
    const onGenerate = vi.fn();
    renderPanel(buildSlot(), { onGenerate });

    const panel = within(screen.getByTestId('rail')).getByTestId(
      'calendar-slot-panel',
    );
    fireEvent.change(within(panel).getByLabelText('Brief override'), {
      target: { value: 'Launch teaser' },
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Generate' }));

    expect(onGenerate).toHaveBeenCalledWith('Launch teaser');
  });

  it('offers cancel instead of skip while generating', () => {
    const onCancel = vi.fn();
    renderPanel(buildSlot({ state: CalendarSlotState.GENERATING }), {
      onCancel,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
  });
});
