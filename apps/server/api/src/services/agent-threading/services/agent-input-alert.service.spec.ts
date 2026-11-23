import type { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import type { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { RecordActivityInput } from '@api/services/activity-recording/activity-recording.types';
import type { AgentThreadSnapshotDocument } from '@api/services/agent-threading/schemas/agent-thread-snapshot.schema';
import { AgentInputAlertService } from '@api/services/agent-threading/services/agent-input-alert.service';
import { ActivityKey, AgentThreadStatus } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function snapshot(requestIds: string[]): AgentThreadSnapshotDocument {
  return {
    pendingInputRequests: requestIds.map((requestId) => ({
      createdAt: '2026-11-22T10:00:00.000Z',
      options: [],
      prompt: 'Which tone?',
      requestId,
      runId: 'run-1',
      title: `Question ${requestId}`,
    })),
  } as unknown as AgentThreadSnapshotDocument;
}

describe('AgentInputAlertService', () => {
  const recorded: RecordActivityInput[] = [];
  let thread: Record<string, unknown> | null;
  let service: AgentInputAlertService;

  beforeEach(() => {
    recorded.length = 0;
    thread = {
      brandId: 'brand-1',
      status: AgentThreadStatus.ACTIVE,
      userId: 'user-1',
    };
    service = new AgentInputAlertService(
      {
        record: async (input: RecordActivityInput) => {
          recorded.push(input);
          return {} as never;
        },
      } as unknown as ActivityRecorderService,
      { findOneSelect: async () => thread } as unknown as AgentThreadsService,
      { warn: vi.fn() } as unknown as LoggerService,
    );
  });

  const record = (before: string[], after: string[]) =>
    service.recordNewQuestions({
      after: snapshot(after),
      before: snapshot(before),
      organizationId: 'org-1',
      threadId: 'thread-1',
    });

  it('records one alert for the thread owner when a question is added', async () => {
    await expect(record([], ['req-1'])).resolves.toBe(1);

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      alert: {
        deduplicationKey: `${ActivityKey.AGENT_INPUT_REQUESTED}/thread-1/req-1`,
        source: { id: 'run-1', type: 'agent_run' },
      },
      brandId: 'brand-1',
      entityId: 'thread-1',
      key: ActivityKey.AGENT_INPUT_REQUESTED,
      organizationId: 'org-1',
      userId: 'user-1',
      value: 'Question req-1',
    });
  });

  it('records only the questions that are new', async () => {
    await expect(record(['req-1'], ['req-1', 'req-2'])).resolves.toBe(1);

    expect(recorded.map((input) => input.alert?.deduplicationKey)).toEqual([
      `${ActivityKey.AGENT_INPUT_REQUESTED}/thread-1/req-2`,
    ]);
  });

  it('records nothing when a question is answered or nothing changed', async () => {
    await expect(record(['req-1'], [])).resolves.toBe(0);
    await expect(record(['req-1'], ['req-1'])).resolves.toBe(0);

    expect(recorded).toEqual([]);
  });

  it('tells nobody about an archived thread', async () => {
    thread = {
      brandId: null,
      status: AgentThreadStatus.ARCHIVED,
      userId: 'user-1',
    };

    await expect(record([], ['req-1'])).resolves.toBe(0);
    expect(recorded).toEqual([]);
  });

  it('never fails the event it is recorded for', async () => {
    service = new AgentInputAlertService(
      {
        record: async () => {
          throw new Error('queue down');
        },
      } as unknown as ActivityRecorderService,
      { findOneSelect: async () => thread } as unknown as AgentThreadsService,
      { warn: vi.fn() } as unknown as LoggerService,
    );

    await expect(record([], ['req-1'])).resolves.toBe(0);
  });
});
