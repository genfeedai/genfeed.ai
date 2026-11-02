import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ANALYTICS_EVENTS } from '@/lib/analytics';
import EditorWorkspace from './EditorWorkspace';

const mocks = vi.hoisted(() => ({ captureAnalyticsEvent: vi.fn() }));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@/lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/analytics')>()),
  captureAnalyticsEvent: mocks.captureAnalyticsEvent,
}));

vi.mock('./EditorCreatePane', () => ({
  default: () => <div>New pane</div>,
}));

vi.mock('./EditorProjectsList', () => ({
  default: () => <div>Projects list</div>,
}));

describe('EditorWorkspace', () => {
  it('shows the output alone when the page has no agent column, and reports the open', () => {
    render(<EditorWorkspace />);

    expect(screen.getByText('Projects list')).toBeInTheDocument();
    expect(mocks.captureAnalyticsEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.STUDIO_EDITOR_OPENED,
      { surface: 'index' },
    );
  });
});
