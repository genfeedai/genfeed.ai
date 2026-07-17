import type { AgentRunSummary } from '@genfeedai/agent/models/agent-chat.model';
import { describe, expect, it, vi } from 'vitest';
import {
  formatRunDuration,
  formatRunStatus,
  formatRunTimestamp,
  getRunActionMessage,
  getRunProgress,
  getRunProvenanceItems,
  getRunStatusClassName,
  isRunCancellable,
  isRunDetailLoadable,
  isRunRetryable,
  readRunAgentScopeString,
  replaceRunInPage,
  selectRunId,
  updateIfRequestActive,
} from './agent-workspace-run.helpers';

function createRun(
  id: string,
  overrides: Partial<AgentRunSummary> = {},
): AgentRunSummary {
  return {
    id,
    label: `Run ${id}`,
    status: 'RUNNING',
    ...overrides,
  };
}

describe('agent workspace run helpers', () => {
  it('normalizes status labels, tones, and available actions', () => {
    expect(formatRunStatus('awaiting_input')).toBe('Awaiting Input');
    expect(getRunStatusClassName('running')).toBe('bg-info/10 text-info');
    expect(getRunStatusClassName('unknown')).toBe(
      'bg-muted text-muted-foreground',
    );
    expect(isRunCancellable('pending')).toBe(true);
    expect(isRunCancellable('completed')).toBe(false);
    expect(isRunRetryable('FAILED')).toBe(true);
    expect(isRunRetryable('running')).toBe(false);
  });

  it('formats bounded progress, durations, timestamps, and nested scope', () => {
    expect(getRunProgress(createRun('1', { progress: 120 }))).toBe(100);
    expect(getRunProgress(createRun('1', { progress: -10 }))).toBe(0);
    expect(formatRunDuration()).toBe('—');
    expect(formatRunDuration(800)).toBe('800ms');
    expect(formatRunDuration(62_000)).toBe('1m 2s');
    expect(formatRunTimestamp()).toBe('Not started');
    expect(formatRunTimestamp('invalid')).toBe('Unknown time');
    expect(
      readRunAgentScopeString(
        { agentScope: { brandId: 'brand-1' } },
        'brandId',
      ),
    ).toBe('brand-1');
    expect(
      readRunAgentScopeString({ agentScope: ['invalid'] }, 'brandId'),
    ).toBeNull();
    expect(
      getRunProvenanceItems(
        createRun('1', {
          artifactReferences: [],
          creditBudget: 10,
          creditsUsed: 3,
          metadata: {
            agentScope: { brandId: 'brand-1' },
            requestedModel: 'openai/gpt-5',
          },
          retryCount: 2,
          thread: 'thread-1',
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Model', value: 'openai/gpt-5' }),
        expect.objectContaining({ label: 'Brand scope', value: 'brand-1' }),
        expect.objectContaining({ label: 'Thread', value: 'thread-1' }),
        expect.objectContaining({ label: 'Credits', value: '3 / 10' }),
        expect.objectContaining({ label: 'Retries', value: '2' }),
        expect.objectContaining({ label: 'Artifacts', value: '0' }),
      ]),
    );
    expect(
      getRunProvenanceItems({
        ...createRun('2', {
          metadata: { agentScope: { brandId: 'fallback-brand' } },
        }),
        brand: { id: 'relationship-object' },
      } as unknown as AgentRunSummary),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Brand scope',
          value: 'fallback-brand',
        }),
      ]),
    );
  });

  it('selects and replaces runs without changing unrelated page entries', () => {
    const firstRun = createRun('1');
    const secondRun = createRun('2');
    const replacement = createRun('2', { status: 'COMPLETED' });
    const page = {
      pagination: { limit: 10, page: 1, pages: 1, total: 2 },
      runs: [firstRun, secondRun],
    };

    expect(selectRunId('2', page.runs)).toBe('2');
    expect(selectRunId('missing', page.runs)).toBe('1');
    expect(selectRunId(null, [])).toBeNull();
    expect(replaceRunInPage(page, replacement)).toEqual({
      ...page,
      runs: [firstRun, replacement],
    });
    expect(replaceRunInPage(null, replacement)).toBeNull();
  });

  it('describes actions and ignores updates after request cancellation', () => {
    const run = createRun('1');
    const activeUpdate = vi.fn();
    const cancelledUpdate = vi.fn();
    const controller = new AbortController();
    controller.abort();

    expect(getRunActionMessage('cancel', run)).toBe('Run 1 was cancelled.');
    expect(getRunActionMessage('retry', run)).toBe(
      'Run 1 was queued for retry.',
    );
    expect(isRunDetailLoadable(true, true, 'run-1')).toBe(true);
    expect(isRunDetailLoadable(false, true, 'run-1')).toBe(false);
    updateIfRequestActive(undefined, activeUpdate);
    updateIfRequestActive(controller.signal, cancelledUpdate);

    expect(activeUpdate).toHaveBeenCalledOnce();
    expect(cancelledUpdate).not.toHaveBeenCalled();
  });
});
