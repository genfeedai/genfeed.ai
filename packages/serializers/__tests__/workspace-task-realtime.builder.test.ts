import {
  buildWorkspaceTaskRealtimeSnapshot,
  serializeWorkspaceTaskDate,
  serializeWorkspaceTaskEvent,
  serializeWorkspaceTaskProgress,
} from '@serializers/server/content/workspace-task-realtime.builder';
import { describe, expect, it } from 'vitest';

const CREATED_AT = new Date('2026-08-01T10:00:00.000Z');
const UPDATED_AT = new Date('2026-08-01T11:00:00.000Z');
const COMPLETED_AT = new Date('2026-08-01T12:00:00.000Z');

describe('serializeWorkspaceTaskDate', () => {
  it('converts Date instances to ISO strings', () => {
    expect(serializeWorkspaceTaskDate(CREATED_AT)).toBe(
      '2026-08-01T10:00:00.000Z',
    );
  });

  it('passes through non-empty strings', () => {
    expect(serializeWorkspaceTaskDate('2026-08-01T10:00:00.000Z')).toBe(
      '2026-08-01T10:00:00.000Z',
    );
  });

  it('returns undefined for empty strings, null, undefined, and numbers', () => {
    expect(serializeWorkspaceTaskDate('')).toBeUndefined();
    expect(serializeWorkspaceTaskDate(null)).toBeUndefined();
    expect(serializeWorkspaceTaskDate(undefined)).toBeUndefined();
    expect(serializeWorkspaceTaskDate(1754042400000)).toBeUndefined();
  });
});

describe('serializeWorkspaceTaskProgress', () => {
  it('defaults counters to zero when progress is missing', () => {
    expect(serializeWorkspaceTaskProgress(null)).toEqual({
      activeRunCount: 0,
      message: undefined,
      percent: 0,
      stage: undefined,
    });
    expect(serializeWorkspaceTaskProgress(undefined)).toEqual({
      activeRunCount: 0,
      message: undefined,
      percent: 0,
      stage: undefined,
    });
  });

  it('preserves populated progress fields', () => {
    expect(
      serializeWorkspaceTaskProgress({
        activeRunCount: 2,
        message: 'Generating captions',
        percent: 45,
        stage: 'generation',
      }),
    ).toEqual({
      activeRunCount: 2,
      message: 'Generating captions',
      percent: 45,
      stage: 'generation',
    });
  });

  it('coalesces null counters to zero while keeping nullable text fields', () => {
    expect(
      serializeWorkspaceTaskProgress({
        activeRunCount: null,
        message: null,
        percent: null,
        stage: null,
      }),
    ).toEqual({
      activeRunCount: 0,
      message: null,
      percent: 0,
      stage: null,
    });
  });
});

describe('serializeWorkspaceTaskEvent', () => {
  it('serializes a fully populated event', () => {
    expect(
      serializeWorkspaceTaskEvent({
        createdAt: CREATED_AT,
        id: 'event-1',
        payload: { step: 'plan' },
        timestamp: UPDATED_AT,
        type: 'task.progress',
        userId: 'user-1',
      }),
    ).toEqual({
      createdAt: '2026-08-01T10:00:00.000Z',
      id: 'event-1',
      payload: { step: 'plan' },
      timestamp: '2026-08-01T11:00:00.000Z',
      type: 'task.progress',
      userId: 'user-1',
    });
  });

  it('falls back to timestamp for createdAt and createdAt for timestamp', () => {
    expect(
      serializeWorkspaceTaskEvent({
        id: 'event-2',
        timestamp: UPDATED_AT,
        type: 'task.created',
      }),
    ).toMatchObject({
      createdAt: '2026-08-01T11:00:00.000Z',
      timestamp: '2026-08-01T11:00:00.000Z',
    });

    expect(
      serializeWorkspaceTaskEvent({
        createdAt: CREATED_AT,
        id: 'event-3',
        type: 'task.created',
      }),
    ).toMatchObject({
      createdAt: '2026-08-01T10:00:00.000Z',
      timestamp: '2026-08-01T10:00:00.000Z',
    });
  });

  it('leaves dates undefined when neither timestamp nor createdAt is set', () => {
    expect(serializeWorkspaceTaskEvent({ id: 'event-4' })).toEqual({
      createdAt: undefined,
      id: 'event-4',
      payload: undefined,
      timestamp: undefined,
      type: undefined,
      userId: undefined,
    });
  });
});

describe('buildWorkspaceTaskRealtimeSnapshot', () => {
  it('builds the flat wire shape from a fully populated task record', () => {
    const snapshot = buildWorkspaceTaskRealtimeSnapshot({
      approvedOutputIds: ['output-1', { toString: () => 'output-2' }],
      brandId: 'brand-1',
      chosenModel: 'model-x',
      chosenProvider: 'provider-y',
      completedAt: COMPLETED_AT,
      createdAt: CREATED_AT,
      decomposition: { steps: 3 },
      dismissedAt: null,
      dismissedReason: null,
      eventStream: [
        {
          createdAt: CREATED_AT,
          id: 'event-1',
          payload: { step: 'plan' },
          timestamp: CREATED_AT,
          type: 'task.created',
          userId: 'user-1',
        },
      ],
      executionPathUsed: 'workflow',
      failureReason: null,
      id: 'task-1',
      linkedApprovalIds: [{ toString: () => 'approval-1' }],
      linkedOutputIds: ['output-3'],
      linkedExecutionIds: ['execution-1', 'execution-2'],
      organizationId: 'org-1',
      outputType: 'video',
      planningThreadId: { toString: () => 'thread-1' },
      platforms: ['instagram'],
      priority: 'high',
      progress: {
        activeRunCount: 1,
        message: 'Working',
        percent: 50,
        stage: 'run',
      },
      qualityAssessment: { score: 0.9 },
      request: 'Make a reel',
      requestedChangesReason: null,
      resultPreview: { url: 'https://example.com/preview' },
      reviewState: 'pending',
      reviewTriggered: true,
      routingSummary: 'routed',
      skillVariantIds: ['variant-1'],
      skillsUsed: ['captioning'],
      status: 'PROCESSING',
      title: 'Reel for launch',
      updatedAt: UPDATED_AT,
    });

    expect(snapshot).toEqual({
      approvedOutputIds: ['output-1', 'output-2'],
      brandId: 'brand-1',
      chosenModel: 'model-x',
      chosenProvider: 'provider-y',
      completedAt: '2026-08-01T12:00:00.000Z',
      createdAt: '2026-08-01T10:00:00.000Z',
      decomposition: { steps: 3 },
      dismissedAt: undefined,
      dismissedReason: null,
      eventStream: [
        {
          createdAt: '2026-08-01T10:00:00.000Z',
          id: 'event-1',
          payload: { step: 'plan' },
          timestamp: '2026-08-01T10:00:00.000Z',
          type: 'task.created',
          userId: 'user-1',
        },
      ],
      executionPathUsed: 'workflow',
      failureReason: null,
      id: 'task-1',
      linkedApprovalIds: ['approval-1'],
      linkedOutputIds: ['output-3'],
      linkedExecutionIds: ['execution-1', 'execution-2'],
      organizationId: 'org-1',
      outputType: 'video',
      planningThreadId: 'thread-1',
      platforms: ['instagram'],
      priority: 'high',
      progress: {
        activeRunCount: 1,
        message: 'Working',
        percent: 50,
        stage: 'run',
      },
      qualityAssessment: { score: 0.9 },
      request: 'Make a reel',
      requestedChangesReason: null,
      resultPreview: { url: 'https://example.com/preview' },
      reviewState: 'pending',
      reviewTriggered: true,
      routingSummary: 'routed',
      skillsUsed: ['captioning'],
      skillVariantIds: ['variant-1'],
      status: 'PROCESSING',
      title: 'Reel for launch',
      updatedAt: '2026-08-01T11:00:00.000Z',
    });
  });

  it('defaults all id collections and the event stream to empty arrays', () => {
    const snapshot = buildWorkspaceTaskRealtimeSnapshot({
      id: 'task-2',
      status: 'PENDING',
    });

    expect(snapshot).toMatchObject({
      approvedOutputIds: [],
      eventStream: [],
      id: 'task-2',
      linkedApprovalIds: [],
      linkedOutputIds: [],
      linkedExecutionIds: [],
      planningThreadId: undefined,
      progress: {
        activeRunCount: 0,
        message: undefined,
        percent: 0,
        stage: undefined,
      },
      skillVariantIds: [],
      status: 'PENDING',
    });
  });

  it('does not leak record-only fields beyond the wire contract', () => {
    const snapshot = buildWorkspaceTaskRealtimeSnapshot({
      id: 'task-3',
      isDeleted: true,
      secretInternalColumn: 'must-not-leak',
    });

    expect(snapshot).not.toHaveProperty('isDeleted');
    expect(snapshot).not.toHaveProperty('secretInternalColumn');
  });
});
