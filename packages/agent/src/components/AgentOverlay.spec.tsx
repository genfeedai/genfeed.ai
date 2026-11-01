import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockUsePathname = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../apps/web/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

vi.mock('@genfeedai/agent/components/AgentPanel', () => ({
  AgentPanel: () => <div data-testid="agent-panel-mock" />,
}));

import { AgentOverlay } from '@genfeedai/agent/components/AgentOverlay';

describe('AgentOverlay', () => {
  it('opens the agent drawer from the launcher and closes it on Escape', async () => {
    mockUsePathname.mockReturnValue('/overview');

    render(<AgentOverlay apiService={{} as never} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const launcher = screen.getByRole('button', { name: 'Open agent' });

    fireEvent.click(launcher);

    const drawer = screen.getByRole('dialog', { name: 'Agent' });
    expect(drawer).toContainElement(screen.getByTestId('agent-panel-mock'));

    fireEvent.keyDown(drawer, { key: 'Escape' });

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(launcher).toHaveFocus();
  });

  it('returns null on dedicated agent routes', () => {
    mockUsePathname.mockReturnValue('/agent/thread-123');

    const { container } = render(<AgentOverlay apiService={{} as never} />);

    expect(container).toBeEmptyDOMElement();
  });
});
