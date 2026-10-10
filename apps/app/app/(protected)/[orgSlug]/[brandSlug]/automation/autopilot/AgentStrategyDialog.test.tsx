import '@testing-library/jest-dom/vitest';
import { AgentAutonomyMode, AgentType } from '@genfeedai/contracts';
import { AgentStrategy } from '@services/automation/agent-strategies.service';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AgentStrategyDialog from './AgentStrategyDialog';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

beforeEach(() => {
  class MockResizeObserver {
    disconnect = vi.fn();
    observe = vi.fn();
    unobserve = vi.fn();
  }
  globalThis.ResizeObserver = MockResizeObserver;
});
afterEach(cleanup);

function configuredStrategy() {
  return new AgentStrategy({
    label: 'Agent',
    agentType: AgentType.GENERAL,
    autonomyMode: AgentAutonomyMode.SUPERVISED,
    isActive: true,
    isEnabled: true,
    topics: ['Useful content'],
    platforms: ['twitter'],
    postsPerWeek: 7,
    publishingCeilingPerWeek: 14,
    readyDraftReserve: 3,
  });
}

describe('configured cadence editing', () => {
  it.each(['publishingCeiling', 'draftReserve'])(
    'blocks saving a blank configured %s and accepts an explicit replacement',
    async (label) => {
      const submit = vi.fn().mockResolvedValue(undefined);
      render(
        <AgentStrategyDialog
          initialStrategy={configuredStrategy()}
          isOpen
          isSubmitting={false}
          onOpenChange={vi.fn()}
          onSubmit={submit}
        />,
      );
      const input = screen.getByLabelText(label);
      const save = screen.getByRole('button', { name: 'Save schedule' });
      fireEvent.change(input, { target: { value: '' } });
      expect(save).toBeDisabled();
      expect(screen.getByRole('alert')).toHaveTextContent('invalid');
      const parentForm = save.closest('form');
      if (!parentForm) throw new Error('Save must belong to the strategy form');
      fireEvent.submit(parentForm);
      expect(submit).not.toHaveBeenCalled();
      fireEvent.change(input, {
        target: { value: label === 'draftReserve' ? '0' : '14' },
      });
      expect(save).toBeEnabled();
      fireEvent.click(save);
      await waitFor(() => expect(submit).toHaveBeenCalledOnce());
      expect(submit.mock.calls[0][0]).toMatchObject({
        publishingCeilingPerWeek: '14',
        readyDraftReserve: label === 'draftReserve' ? '0' : '3',
      });
    },
  );
  it('keeps legacy controls blank when saving unrelated edits', async () => {
    const strategy = configuredStrategy();
    strategy.publishingCeilingPerWeek = undefined;
    strategy.readyDraftReserve = undefined;
    const submit = vi.fn().mockResolvedValue(undefined);
    render(
      <AgentStrategyDialog
        initialStrategy={strategy}
        isOpen
        isSubmitting={false}
        onOpenChange={vi.fn()}
        onSubmit={submit}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0][0]).toMatchObject({
      publishingCeilingPerWeek: '',
      readyDraftReserve: '',
    });
  });
});
