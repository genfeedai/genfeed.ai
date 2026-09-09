import { EmailDigestService } from '@api/collections/content-performance/services/email-digest.service';
import {
  buildEmailDigestChildWorkflowDefinition,
  buildEmailDigestWorkflowDefinition,
  EMAIL_DIGEST_ACTION_IDS,
  EMAIL_DIGEST_CHILD_WORKFLOW_ID,
  EmailDigestWorkflowService,
} from '@api/collections/content-performance/services/email-digest-workflow.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

describe('email digest workflow definitions', () => {
  it('prepares, discovers, renders, fans out, and finalizes', () => {
    const definition = buildEmailDigestWorkflowDefinition();
    expect(
      definition.definition.nodes.map((node) => node.data.config.actionId),
    ).toEqual([
      EMAIL_DIGEST_ACTION_IDS.PREPARE,
      EMAIL_DIGEST_ACTION_IDS.DISCOVER,
      EMAIL_DIGEST_ACTION_IDS.RENDER,
      'workflow.for-each',
      EMAIL_DIGEST_ACTION_IDS.FINALIZE,
    ]);
    const fanOut = definition.definition.nodes.find(
      (node) => node.data.config.actionId === 'workflow.for-each',
    );
    expect(fanOut?.data?.config).toMatchObject({
      parameters: {
        childWorkflowId: EMAIL_DIGEST_CHILD_WORKFLOW_ID,
        itemInputKey: 'delivery',
        mode: 'await',
      },
    });
  });

  it('keeps one recipient delivery as the child atomic action', () => {
    const child = buildEmailDigestChildWorkflowDefinition();
    expect(child.definition.nodes).toHaveLength(1);
    expect(child.definition.nodes[0]?.data.config.actionId).toBe(
      EMAIL_DIGEST_ACTION_IDS.DELIVER,
    );
  });
});

describe('email digest durable workflow results', () => {
  async function setup() {
    const handlers = new Map<
      string,
      (request: { input: Record<string, unknown> }) => unknown
    >();
    const normalized = {
      organizationId: 'org-1',
      brandId: 'brand-1',
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: '2026-08-07T23:59:59.999Z',
    };
    const queueSystemWorkflow = vi.fn().mockResolvedValue('job-1');
    const module = await Test.createTestingModule({
      providers: [
        EmailDigestWorkflowService,
        {
          provide: EmailDigestService,
          useValue: { normalizeOptions: vi.fn(() => normalized) },
        },
        {
          provide: WorkflowExecutionQueueService,
          useValue: { queueSystemWorkflow },
        },
        {
          provide: SystemWorkflowRunnerService,
          useValue: {
            registerWorkflow: vi.fn(),
            registerAction: vi.fn((id, handler) => handlers.set(id, handler)),
          },
        },
      ],
    }).compile();
    const service = module.get(EmailDigestWorkflowService);
    service.onModuleInit();
    return { service, handlers, queueSystemWorkflow, normalized };
  }

  it('freezes explicit report dates before queueing and uses a Bull-safe deduplication key', async () => {
    const { service, queueSystemWorkflow, normalized } = await setup();
    await service.enqueue({ organizationId: 'org-1', brandId: 'brand-1' });
    expect(queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ inputValues: { request: normalized } }),
      expect.stringMatching(/^email-digest-org-1-brand-1-[a-f0-9]{64}$/),
      { attempts: 3, replaceTerminalJob: true },
    );
  });

  it('reports queued recipients separately from provider delivery and counts missing child outcomes as errors', async () => {
    const { handlers } = await setup();
    const result = handlers.get(EMAIL_DIGEST_ACTION_IDS.FINALIZE)?.({
      input: {
        rendered: { deliveries: [{}, {}, {}] },
        dispatch: {
          results: [
            { result: { userId: 'a', queued: true } },
            { result: { userId: 'b', queued: false, error: 'offline' } },
          ],
        },
      },
    });
    expect(result).toEqual({ queued: 1, sent: 0, errors: 2, skipped: 0 });
  });

  it('reports an empty recipient audience as skipped', async () => {
    const { handlers } = await setup();
    expect(
      handlers.get(EMAIL_DIGEST_ACTION_IDS.FINALIZE)?.({
        input: { rendered: { deliveries: [] }, dispatch: { results: [] } },
      }),
    ).toEqual({ queued: 0, sent: 0, errors: 0, skipped: 1 });
  });
});
