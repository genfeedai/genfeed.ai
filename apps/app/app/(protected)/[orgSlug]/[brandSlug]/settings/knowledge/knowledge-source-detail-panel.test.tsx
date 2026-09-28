import {
  ContextSidebarOutlet,
  ContextSidebarProvider,
  useContextSidebar,
} from '@contexts/ui/context-sidebar-context';
import {
  KnowledgeProcessingState,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import type { KnowledgeSourceRow } from '@props/content/knowledge-library.props';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import KnowledgeSourceDetailPanel from './knowledge-source-detail-panel';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const ROW = {
  source: {
    id: 'source-a',
    isVisible: true,
    kind: KnowledgeSourceKind.TEXT,
    purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
    title: 'Brand voice notes',
  },
  spaceIds: [],
  version: {
    id: 'source-a-v1',
    isCurrent: true,
    observedAt: '2026-09-06T10:00:00.000Z',
    payload: { text: 'We speak plainly.' },
    processingError: null,
    processingState: KnowledgeProcessingState.FAILED,
    retrievalState: 'ACTIVE',
    version: 1,
  },
} as unknown as KnowledgeSourceRow;

function CloseControl() {
  const contextSidebar = useContextSidebar();

  return (
    <button type="button" onClick={contextSidebar?.close}>
      Close sidebar
    </button>
  );
}

function renderPanel(row: KnowledgeSourceRow | null) {
  const handlers = {
    onArchive: vi.fn(async () => undefined),
    onClose: vi.fn(),
    onMoveToSpace: vi.fn(async () => undefined),
    onRetry: vi.fn(async () => undefined),
    onUpdate: vi.fn(async () => undefined),
  };

  render(
    <ContextSidebarProvider>
      <CloseControl />
      <ContextSidebarOutlet testId="context-sidebar-outlet" />
      <KnowledgeSourceDetailPanel
        brandId="brand-1"
        row={row}
        spaces={[]}
        {...handlers}
      />
    </ContextSidebarProvider>,
  );

  return handlers;
}

describe('KnowledgeSourceDetailPanel', () => {
  it('renders nothing into the sidebar without a selected source', () => {
    renderPanel(null);

    expect(screen.getByTestId('context-sidebar-outlet')).toBeEmptyDOMElement();
  });

  it('renders the selected source in the sidebar and deselects on close', () => {
    const handlers = renderPanel(ROW);

    const outlet = screen.getByTestId('context-sidebar-outlet');
    expect(outlet).toHaveTextContent('We speak plainly.');

    fireEvent.click(
      within(outlet).getByRole('button', { name: 'Retry ingestion' }),
    );
    expect(handlers.onRetry).toHaveBeenCalledWith(ROW.source);

    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }));
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });
});
