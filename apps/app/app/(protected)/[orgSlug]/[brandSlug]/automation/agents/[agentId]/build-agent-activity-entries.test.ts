import { ReviewDecision, TargetExecutionState } from '@genfeedai/contracts';
import type {
  IAgentStrategyRunHistoryItem,
  IPost,
  IWorkflowExecution,
} from '@genfeedai/contracts/interfaces';
import type { AgentStrategyReport } from '@services/automation/agent-strategies.service';
import { describe, expect, it, vi } from 'vitest';
import {
  buildContentActivityEntries,
  buildReportActivityEntries,
  buildRunActivityEntries,
} from './build-agent-activity-entries';

const translate = vi.fn((key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${JSON.stringify(values)}` : key,
);

function buildPost(overrides: Partial<IPost> = {}): IPost {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    id: 'post-1',
    isDeleted: false,
    status: 'draft',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as unknown as IPost;
}

describe('buildContentActivityEntries', () => {
  it('flags a post with review lineage and an unset decision as pending', () => {
    const entries = buildContentActivityEntries(
      [
        buildPost({
          reviewBatchId: 'batch-1',
          reviewDecision: ReviewDecision.UNSET,
          targetExecutionState: TargetExecutionState.DRAFT,
        }),
      ],
      translate,
      (id) => `/publishing/posts/${id}`,
    );

    expect(entries[0].type).toBe('content');
    expect(entries[0].href).toBe('/publishing/posts/post-1');
    expect(translate).toHaveBeenCalledWith(
      'postMetaPending',
      expect.any(Object),
    );
  });
});

describe('buildReportActivityEntries', () => {
  it('sorts by the report period end via its timestamp field', () => {
    const reports: AgentStrategyReport[] = [
      {
        allocationChanges: [],
        bestPlatformFormatPairs: [],
        bestPostingWindows: [],
        clicks: 0,
        costPerVisit: null,
        creditsSpent: 5,
        ctr: 0,
        generatedCount: 2,
        id: 'report-1',
        impressions: 0,
        periodEnd: '2026-01-02T00:00:00.000Z',
        periodStart: '2026-01-01T00:00:00.000Z',
        publishedCount: 1,
        reportType: 'daily',
        topHooks: [],
        topTopics: [],
        visits: null,
      },
    ];

    const entries = buildReportActivityEntries(reports, translate);

    expect(entries[0].timestamp).toBe('2026-01-02T00:00:00.000Z');
    expect(entries[0].type).toBe('report');
  });
});

describe('buildRunActivityEntries', () => {
  it('builds one entry per run and per execution without deduplicating', () => {
    const runHistory: IAgentStrategyRunHistoryItem[] = [
      {
        completedAt: '2026-01-01T00:05:00.000Z',
        contentGenerated: 2,
        creditsUsed: 3,
        startedAt: '2026-01-01T00:00:00.000Z',
        status: 'completed',
      },
    ];
    const executions: IWorkflowExecution[] = [
      {
        completedAt: '2026-01-02T00:05:00.000Z',
        createdAt: '2026-01-02T00:00:00.000Z',
        creditsUsed: 6,
        id: 'execution-1',
        metadata: {},
        nodeResults: [],
        organizationId: 'org-1',
        startedAt: '2026-01-02T00:00:00.000Z',
        status: 'COMPLETED',
        updatedAt: '2026-01-02T00:05:00.000Z',
      } as unknown as IWorkflowExecution,
    ];

    const entries = buildRunActivityEntries(
      runHistory,
      executions,
      translate,
      (id) => `/agent/${id}`,
      (id) => `/runs/${id}`,
    );

    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.type === 'run')).toBe(true);
    expect(
      entries.find((entry) => entry.id === 'execution-execution-1')?.href,
    ).toBe('/runs/execution-1');
  });
});
