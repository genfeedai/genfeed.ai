import { CommandPaletteProvider } from '@genfeedai/contexts/features/command-palette.provider';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCommandPalette } from '@/hooks/ui/use-command-palette/use-command-palette';
import * as taskComposerEvents from '@/lib/workspace/task-composer-events';
import SidebarStripActions from './SidebarStripActions';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

function PaletteState() {
  const { state } = useCommandPalette();
  return <output>{state.isOpen ? 'Palette open' : 'Palette closed'}</output>;
}

function renderActions(layout: 'row' | 'icons') {
  return render(
    <CommandPaletteProvider>
      <SidebarStripActions layout={layout} />
      <PaletteState />
    </CommandPaletteProvider>,
  );
}

describe('SidebarStripActions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['row', 'icons'] as const)(
    'opens the task composer from the %s layout',
    (layout) => {
      const open = vi
        .spyOn(taskComposerEvents, 'dispatchOpenTaskComposer')
        .mockImplementation(() => undefined);
      renderActions(layout);

      fireEvent.click(
        screen.getByRole('button', { name: 'Open new task modal' }),
      );

      expect(open).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['row', 'icons'] as const)(
    'opens the command palette from the %s layout',
    (layout) => {
      renderActions(layout);

      fireEvent.click(screen.getByRole('button', { name: 'Search' }));

      expect(screen.getByText('Palette open')).toBeInTheDocument();
    },
  );

  it('shows the New Task label in the row layout and only an icon in the icons layout', () => {
    const { unmount } = renderActions('row');
    expect(screen.getByText('New Task')).toBeInTheDocument();
    unmount();

    renderActions('icons');
    expect(screen.queryByText('New Task')).not.toBeInTheDocument();
  });
});
