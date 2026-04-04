import { AgentThreadProjectorService } from '@api/services/agent-threading/services/agent-thread-projector.service';
import { Types } from 'mongoose';

describe('AgentThreadProjectorService', () => {
  let service: AgentThreadProjectorService;

  beforeEach(() => {
    service = new AgentThreadProjectorService();
  });

  it('tracks pending input requests and removes them when resolved', () => {
    const threadId = new Types.ObjectId();

    const afterInputRequested = service.applyEvent(null, {
      commandId: 'cmd-1',
      eventId: 'event-1',
      occurredAt: '2026-03-09T10:00:00.000Z',
      payload: {
        allowFreeText: true,
        options: [{ id: 'approve', label: 'Approve' }],
        prompt: 'Approve this draft?',
        requestId: 'input-1',
        title: 'Approval required',
      },
      runId: 'run-1',
      sequence: 1,
      thread: threadId,
      type: 'input.requested',
    } as never);

    expect(afterInputRequested.pendingInputRequests).toEqual([
      {
        allowFreeText: true,
        createdAt: '2026-03-09T10:00:00.000Z',
        options: [{ id: 'approve', label: 'Approve' }],
        prompt: 'Approve this draft?',
        recommendedOptionId: undefined,
        requestId: 'input-1',
        title: 'Approval required',
      },
    ]);

    const afterInputResolved = service.applyEvent(
      afterInputRequested as never,
      {
        commandId: 'cmd-2',
        eventId: 'event-2',
        occurredAt: '2026-03-09T10:01:00.000Z',
        payload: {
          answer: 'approve',
          requestId: 'input-1',
        },
        runId: 'run-1',
        sequence: 2,
        thread: threadId,
        type: 'input.resolved',
      } as never,
    );

    expect(afterInputResolved.pendingInputRequests).toEqual([]);
  });

  it('stores the final assistant message and run completion state', () => {
    const threadId = new Types.ObjectId();

    const afterRunStarted = service.applyEvent(null, {
      commandId: 'cmd-run',
      eventId: 'event-run',
      occurredAt: '2026-03-09T11:00:00.000Z',
      payload: {
        model: 'openai/gpt-4.1',
        startedAt: '2026-03-09T11:00:00.000Z',
      },
      runId: 'run-2',
      sequence: 1,
      thread: threadId,
      type: 'thread.turn_started',
    } as never);

    const afterAssistantFinalized = service.applyEvent(
      afterRunStarted as never,
      {
        commandId: 'cmd-final',
        eventId: 'event-final',
        occurredAt: '2026-03-09T11:02:00.000Z',
        payload: {
          content: 'Final assistant response',
          messageId: 'message-1',
          metadata: { model: 'openai/gpt-4.1' },
        },
        runId: 'run-2',
        sequence: 2,
        thread: threadId,
        type: 'assistant.finalized',
      } as never,
    );

    const afterRunCompleted = service.applyEvent(
      afterAssistantFinalized as never,
      {
        commandId: 'cmd-complete',
        eventId: 'event-complete',
        occurredAt: '2026-03-09T11:02:10.000Z',
        payload: {
          detail: 'Run completed successfully',
          label: 'Run completed',
          status: 'completed',
        },
        runId: 'run-2',
        sequence: 3,
        thread: threadId,
        type: 'run.completed',
      } as never,
    );

    expect(afterRunCompleted.lastAssistantMessage).toEqual({
      content: 'Final assistant response',
      createdAt: '2026-03-09T11:02:00.000Z',
      messageId: 'message-1',
      metadata: { model: 'openai/gpt-4.1' },
    });
    expect(afterRunCompleted.activeRun).toEqual({
      completedAt: '2026-03-09T11:02:10.000Z',
      model: 'openai/gpt-4.1',
      runId: 'run-2',
      startedAt: '2026-03-09T11:00:00.000Z',
      status: 'completed',
    });
    expect(afterRunCompleted.timeline).toHaveLength(3);
  });

  it('stores proposed plan review metadata from plan events', () => {
    const threadId = new Types.ObjectId();

    const afterPlanUpserted = service.applyEvent(null, {
      commandId: 'cmd-plan',
      eventId: 'event-plan',
      occurredAt: '2026-03-10T09:00:00.000Z',
      payload: {
        awaitingApproval: true,
        content:
          '1. Add the toggle\n2. Persist the flag\n3. Pause for approval',
        explanation: 'Plan mode should stop before execution.',
        id: 'plan-1',
        lastReviewAction: 'request_changes',
        revisionNote: 'Put the toggle in the prompt bar.',
        status: 'awaiting_approval',
        steps: [{ status: 'pending', step: 'Add thread-level plan mode' }],
      },
      runId: 'run-plan',
      sequence: 1,
      thread: threadId,
      type: 'plan.upserted',
    } as never);

    expect(afterPlanUpserted.latestProposedPlan).toEqual({
      awaitingApproval: true,
      content: '1. Add the toggle\n2. Persist the flag\n3. Pause for approval',
      createdAt: '2026-03-10T09:00:00.000Z',
      explanation: 'Plan mode should stop before execution.',
      id: 'plan-1',
      lastReviewAction: 'request_changes',
      revisionNote: 'Put the toggle in the prompt bar.',
      status: 'awaiting_approval',
      steps: [{ status: 'pending', step: 'Add thread-level plan mode' }],
      updatedAt: '2026-03-10T09:00:00.000Z',
    });
  });
});
