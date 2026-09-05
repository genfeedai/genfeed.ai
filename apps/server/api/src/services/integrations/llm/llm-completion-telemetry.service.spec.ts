import { runWithWorkflowAccounting } from '@api/collections/workflow-executions/services/workflow-accounting.context';
import { LlmCompletionTelemetryService } from '@api/services/integrations/llm/llm-completion-telemetry.service';
import type { LlmCostSettlementQueueService } from '@api/services/integrations/llm/llm-cost-settlement-queue.service';
import { LlmVendorCostLedgerService } from '@api/services/integrations/llm/llm-vendor-cost-ledger.service';
import { LLM_GENERATION_TELEMETRY_EVENT } from '@genfeedai/contracts/constants';
import type { ILlmCompletionTelemetryEvent } from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { safeFetch } from '@libs/security/destination-guard';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@libs/security/destination-guard', () => ({
  safeFetch: vi.fn().mockResolvedValue({ ok: true }),
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

describe('LlmCompletionTelemetryService', () => {
  const ledger = { record: vi.fn() };
  const configService = { get: vi.fn() };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  let service: LlmCompletionTelemetryService;

  beforeEach(async () => {
    vi.clearAllMocks();
    ledger.record.mockResolvedValue(undefined);
    configService.get.mockImplementation((key: string) => {
      if (key === 'POSTHOG_PROJECT_API_KEY') {
        return 'phc_testkey';
      }
      if (key === 'POSTHOG_HOST') {
        return 'https://eu.i.posthog.com';
      }
      return '';
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmCompletionTelemetryService,
        { provide: LlmVendorCostLedgerService, useValue: ledger },
        { provide: ConfigService, useValue: configService },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get(LlmCompletionTelemetryService);
  });

  it('persists vendor cost and captures $ai_generation without prompt content', async () => {
    await service.recordCompletion(event);

    expect(ledger.record).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        isByok: false,
        model: 'deepseek/deepseek-v4-flash-0731',
        organizationId: 'org-1',
        vendorCostMicros: 130,
      }),
    );

    await vi.waitFor(() => {
      expect(safeFetch).toHaveBeenCalled();
    });

    const fetchArgs = vi.mocked(safeFetch).mock.calls[0];
    const body = JSON.parse(String(fetchArgs?.[1]?.body)) as {
      event: string;
      properties: Record<string, unknown>;
    };
    expect(body.event).toBe(LLM_GENERATION_TELEMETRY_EVENT);
    expect(JSON.stringify(body.properties)).not.toContain('SECRET');
    expect(Object.hasOwn(body.properties, 'messages')).toBe(false);
    expect(Object.hasOwn(body.properties, 'prompt')).toBe(false);
    expect(Object.hasOwn(body.properties, 'completion')).toBe(false);
    expect(Object.hasOwn(body.properties, 'content')).toBe(false);
    expect(Object.hasOwn(body.properties, '$ai_input')).toBe(false);
    expect(Object.hasOwn(body.properties, '$ai_output_choices')).toBe(false);
  });

  it('records BYOK tokens with vendorCostMicros 0 and skips our COGS', async () => {
    await service.recordCompletion({ ...event, isByok: true });

    expect(ledger.record).toHaveBeenCalledWith(
      expect.objectContaining({
        isByok: true,
        vendorCostMicros: 0,
      }),
    );
  });

  it('skips the ledger when organizationId is missing', async () => {
    await service.recordCompletion({
      ...event,
      organizationId: undefined,
    });

    expect(ledger.record).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(safeFetch).toHaveBeenCalled();
    });
  });

  it('does not fail the caller when the ledger write throws', async () => {
    ledger.record.mockRejectedValueOnce(new Error('db down'));

    await expect(service.recordCompletion(event)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
  it('creates distinct durable intents for genuine calls and queues frozen settlements', async () => {
    const queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const scopedService = new LlmCompletionTelemetryService(
      ledger as unknown as LlmVendorCostLedgerService,
      configService as unknown as ConfigService,
      logger as unknown as LoggerService,
      queue as unknown as LlmCostSettlementQueueService,
    );
    const ids = await runWithWorkflowAccounting(
      {
        organizationId: 'org-1',
        workflowExecutionId: 'exec',
        workflowNodeId: 'node',
        workflowOperationId: 'attempt',
      },
      async () => [
        await scopedService.beginWorkflowOperation(
          'org-1',
          'model',
          'openrouter',
          false,
        ),
        await scopedService.beginWorkflowOperation(
          'org-1',
          'model',
          'openrouter',
          false,
        ),
      ],
    );
    expect(ids[0]).not.toBe(ids[1]);
    expect(ledger.record).toHaveBeenCalledTimes(2);
    await scopedService.recordCompletion({
      ...event,
      workflowLedgerId: ids[0],
      vendorCostMicros: 1234,
    });
    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowLedgerId: ids[0],
        vendorCostMicros: 1234,
        costEvidence: 'observed',
        organizationId: 'org-1',
      }),
    );
    expect(ledger.record).toHaveBeenCalledTimes(2);
    queue.enqueue.mockRejectedValueOnce(new Error('redis down'));
    await scopedService.recordCompletion({
      ...event,
      workflowLedgerId: ids[0],
      vendorCostMicros: 1234,
    });
    expect(ledger.record).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowLedgerId: ids[0],
        vendorCostMicros: 1234,
      }),
    );
  });
});
