import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import AgentDockHistory from './AgentDockHistory';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});
describe('AgentDockHistory', () => {
  it('announces the real list loading state before offering threads', () => {
    render(
      <AgentDockHistory
        isThreadListLoading
        threads={[{ id: 'one', title: 'Launch plan' }]}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading threads');
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('shows an empty state without a duplicate new-thread action', () => {
    render(<AgentDockHistory />);
    expect(screen.getByText('No threads yet')).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('marks the actual active thread and selects another real thread', () => {
    const onSelectThread = vi.fn();
    render(
      <AgentDockHistory
        activeThreadId="one"
        onSelectThread={onSelectThread}
        threads={[
          { id: 'one', title: 'Launch plan' },
          { id: 'two', title: 'Caption ideas' },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Launch plan' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Caption ideas' }));
    expect(onSelectThread).toHaveBeenCalledWith('two');
  });
});
