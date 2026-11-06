import { runWithWorkflowAccounting } from '@api/collections/workflow-executions/services/workflow-accounting.context';
import { LlmCompletionTelemetryService } from '@api/services/integrations/llm/llm-completion-telemetry.service';
import type { LlmCostSettlementQueueService } from '@api/services/integrations/llm/llm-cost-settlement-queue.service';
import type { LlmVendorCostLedgerService } from '@api/services/integrations/llm/llm-vendor-cost-ledger.service';
import { LLM_GENERATION_TELEMETRY_EVENT } from '@genfeedai/contracts/constants';
import type {
  ILlmCompletionTelemetryEvent,
  ILlmVendorCostRecordInput,
} from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface CapturedEvent {
  event: string;
  properties: Record<string, unknown>;
}

const captured = vi.hoisted(() => ({ bodies: [] as string[] }));

vi.mock('@libs/security/destination-guard', () => ({
  safeFetch: vi.fn(async (_url: string, init?: { body?: unknown }) => {
    captured.bodies.push(String(init?.body));
    return { ok: true };
  }),
}));

const event: ILlmCompletionTelemetryEvent = {
  brandId: 'brand-1',
  completionTokens: 500,
  isByok: false,
  latencyMs: 42,
  model: 'deepseek/deepseek-v4-flash-0731',
  organizationId: 'org-1',
  promptTokens: 1_000,
  provider: 'openrouter',
  runId: 'run-1',
  threadId: 'thread-1',
};

function capturedEvents(): CapturedEvent[] {
  return captured.bodies.map((body) => JSON.parse(body) as CapturedEvent);
}

describe('LlmCompletionTelemetryService', () => {
  let ledgerRows: ILlmVendorCostRecordInput[];
  let isLedgerDown: boolean;
  let queued: ILlmVendorCostRecordInput[];
  let isQueueDown: boolean;
  let errors: string[];

  const ledger = {
    record: async (input: ILlmVendorCostRecordInput): Promise<void> => {
      if (isLedgerDown) {
        throw new Error('db down');
      }
      ledgerRows.push(input);
    },
  };
  const queue = {
    enqueue: async (input: ILlmVendorCostRecordInput): Promise<void> => {
      if (isQueueDown) {
        throw new Error('redis down');
      }
      queued.push(input);
    },
  };
  const configService = {
    get: (key: string) => {
      if (key === 'POSTHOG_PROJECT_API_KEY') {
        return 'phc_testkey';
      }
      if (key === 'POSTHOG_HOST') {
        return 'https://eu.i.posthog.com';
      }
      return '';
    },
  };
  const logger = {
    debug: () => undefined,
    error: (message: string) => {
      errors.push(message);
    },
    log: () => undefined,
    warn: () => undefined,
  };

  function createService(withQueue = false): LlmCompletionTelemetryService {
    return new LlmCompletionTelemetryService(
      ledger as unknown as LlmVendorCostLedgerService,
      configService as unknown as ConfigService,
      logger as unknown as LoggerService,
      withQueue
        ? (queue as unknown as LlmCostSettlementQueueService)
        : undefined,
    );
  }

  beforeEach(() => {
    captured.bodies = [];
    ledgerRows = [];
    isLedgerDown = false;
    queued = [];
    isQueueDown = false;
    errors = [];
  });

  it('freezes unknown model pricing explicitly in the receipt', async () => {
    await createService().recordCompletion({
      ...event,
      model: 'unregistered-model',
    });

    expect(ledgerRows).toEqual([
      expect.objectContaining({
        costEvidence: 'unknown',
        pricingSnapshot: {
          completionPerMillion: null,
          fingerprint: expect.any(String),
          promptPerMillion: null,
          source: 'agent_chat_model_catalog',
        },
      }),
    ]);
  });

  it('persists vendor cost and captures $ai_generation without prompt content', async () => {
    await createService().recordCompletion(event);

    expect(ledgerRows).toEqual([
      expect.objectContaining({
        brandId: 'brand-1',
        costEvidence: 'calculated',
        isByok: false,
        model: 'deepseek/deepseek-v4-flash-0731',
        organizationId: 'org-1',
        vendorCostMicros: 130,
      }),
    ]);

    await vi.waitFor(() => {
      expect(captured.bodies).toHaveLength(1);
    });
    const [body] = capturedEvents();
    expect(body?.event).toBe(LLM_GENERATION_TELEMETRY_EVENT);
    const properties = body?.properties ?? {};
    expect(properties).not.toHaveProperty('messages');
    expect(properties).not.toHaveProperty('prompt');
    expect(properties).not.toHaveProperty('completion');
    expect(properties).not.toHaveProperty('content');
    expect(properties).not.toHaveProperty('$ai_input');
    expect(properties).not.toHaveProperty('$ai_output_choices');
  });

  it('records BYOK tokens with vendorCostMicros 0 and skips our COGS', async () => {
    await createService().recordCompletion({ ...event, isByok: true });

    expect(ledgerRows).toEqual([
      expect.objectContaining({
        costEvidence: 'byok',
        isByok: true,
        vendorCostMicros: 0,
      }),
    ]);
  });

  it('still captures analytics but writes no ledger row without an organization', async () => {
    await createService().recordCompletion({
      ...event,
      organizationId: undefined,
    });

    expect(ledgerRows).toEqual([]);
    await vi.waitFor(() => {
      expect(captured.bodies).toHaveLength(1);
    });
  });

  it('does not fail the caller when the ledger write throws', async () => {
    isLedgerDown = true;

    await expect(
      createService().recordCompletion(event),
    ).resolves.toBeUndefined();
    expect(errors).toEqual([
      'LlmCompletionTelemetryService failed to persist vendor cost',
    ]);
  });

  describe('workflow operations', () => {
    const accounting = {
      organizationId: 'org-1',
      workflowExecutionId: 'exec',
      workflowNodeId: 'node',
      workflowOperationId: 'attempt',
    };
    const context = {
      brandId: 'brand-1',
      runId: 'run-1',
      threadId: 'thread-1',
    };

    async function beginTwo(
      service: LlmCompletionTelemetryService,
    ): Promise<Array<string | undefined>> {
      return runWithWorkflowAccounting(accounting, async () => [
        await service.beginWorkflowOperation(
          'org-1',
          'model',
          'openrouter',
          false,
          context,
        ),
        await service.beginWorkflowOperation(
          'org-1',
          'model',
          'openrouter',
          false,
          context,
        ),
      ]);
    }

    it('opens one pending ledger intent per genuine call', async () => {
      const ids = await beginTwo(createService(true));

      expect(ids[0]).not.toBe(ids[1]);
      expect(ledgerRows).toEqual([
        expect.objectContaining({
          brandId: 'brand-1',
          costEvidence: 'pending',
          runId: 'run-1',
          threadId: 'thread-1',
          workflowLedgerId: ids[0],
        }),
        expect.objectContaining({
          costEvidence: 'pending',
          workflowLedgerId: ids[1],
        }),
      ]);
    });

    it('opens no intent outside a workflow execution', async () => {
      const id = await createService(true).beginWorkflowOperation(
        'org-1',
        'model',
        'openrouter',
        false,
        context,
      );

      expect(id).toBeUndefined();
      expect(ledgerRows).toEqual([]);
    });

    it('queues the observed settlement instead of writing the ledger', async () => {
      const service = createService(true);
      const [ledgerId] = await beginTwo(service);

      await service.recordCompletion({
        ...event,
        vendorCostMicros: 1234,
        workflowLedgerId: ledgerId,
      });

      expect(queued).toEqual([
        expect.objectContaining({
          costEvidence: 'observed',
          organizationId: 'org-1',
          vendorCostMicros: 1234,
          workflowLedgerId: ledgerId,
        }),
      ]);
      expect(ledgerRows).toHaveLength(2);
    });

    it('writes the settlement directly when the queue is unavailable', async () => {
      const service = createService(true);
      const [ledgerId] = await beginTwo(service);
      isQueueDown = true;

      await service.recordCompletion({
        ...event,
        vendorCostMicros: 1234,
        workflowLedgerId: ledgerId,
      });

      expect(queued).toEqual([]);
      expect(ledgerRows[2]).toEqual(
        expect.objectContaining({
          costEvidence: 'observed',
          vendorCostMicros: 1234,
          workflowLedgerId: ledgerId,
        }),
      );
      expect(errors).toEqual([
        'Workflow cost settlement queue unavailable; persisting directly',
      ]);
    });
  });
});
