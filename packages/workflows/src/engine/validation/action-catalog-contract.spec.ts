import { ALL_ACTIONS, getActionDefinition } from '@genfeedai/actions';
import { describe, expect, it } from 'vitest';
import {
  type ActionContractJsonSchema,
  compileActionContract,
} from './action-contract';

/**
 * Every published action is compiled by the engine at API bootstrap, so a single
 * unconstrained schema takes the whole process down rather than failing the one
 * workflow that uses it. Compile the catalog here instead, where the failure is
 * a red unit test naming every offender at once.
 */
describe('published action catalog', () => {
  // Compiles the full published catalog. Adding one action is cheap locally,
  // but a contended CI runner can exceed the 15s package default.
  it('compiles every action contract the engine will register', {
    timeout: 60_000,
  }, () => {
    const failures: string[] = [];
    for (const action of ALL_ACTIONS) {
      try {
        compileActionContract(action.id, {
          inputSchema: action.inputSchema as ActionContractJsonSchema,
          outputSchema: action.outputSchema as ActionContractJsonSchema,
        });
      } catch (error: unknown) {
        failures.push(
          error instanceof Error ? error.message : `${action.id}: unknown`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it('accepts an in-flight generate_image result without a CDN url', () => {
    const action = getActionDefinition('generate_image');
    expect(action).toBeDefined();
    const contract = compileActionContract('generate_image', {
      inputSchema: (action?.inputSchema ?? {}) as ActionContractJsonSchema,
      outputSchema: (action?.outputSchema ?? {}) as ActionContractJsonSchema,
    });
    const provenance = {
      nodeId: 'execute-tool',
      runId: 'run-1',
      workflowId: 'agent.tool.generate_image',
      workflowVersionId: 'v1',
    };

    expect(() =>
      contract.validateOutput(
        {
          creditsUsed: 0,
          data: { id: 'img-1', status: 'processing' },
          isBillingDelegated: true,
          nextActions: [],
          success: true,
        },
        provenance,
      ),
    ).not.toThrow();

    expect(() =>
      contract.validateOutput(
        {
          creditsUsed: 0,
          data: {
            id: 'img-1',
            status: 'processing',
            url: undefined,
          },
          isBillingDelegated: true,
          success: true,
        },
        provenance,
      ),
    ).toThrow('Action contract output validation failed');
  });
});

describe('generate_content_batch input contract', () => {
  const action = getActionDefinition('generate_content_batch');
  const contract = compileActionContract('generate_content_batch', {
    inputSchema: (action?.inputSchema ?? {}) as ActionContractJsonSchema,
    outputSchema: (action?.outputSchema ?? {}) as ActionContractJsonSchema,
  });
  const provenance = {
    nodeId: 'execute-tool',
    runId: 'run-batch',
    workflowId: 'agent.tool.generate_content_batch',
    workflowVersionId: 'v1',
  };
  const input = { count: 5, platforms: ['instagram'] };

  it.each([
    { end: '2026-09-30', start: '2026-09-23' },
    { end: '2026-09-30T12:00:00.000Z', start: '2026-09-23T12:00:00.000Z' },
  ])('accepts a scheduling range: %j', (dateRange) => {
    expect(() =>
      contract.validateInput({ ...input, dateRange }, provenance),
    ).not.toThrow();
  });

  it.each([
    {
      carouselPercent: 10,
      imagePercent: 60,
      reelPercent: 5,
      storyPercent: 0,
      videoPercent: 25,
    },
    { imagePercent: 100 },
    {},
  ])('accepts a supported content mix: %j', (contentMix) => {
    expect(() =>
      contract.validateInput({ ...input, contentMix }, provenance),
    ).not.toThrow();
  });

  it('keeps scheduling and content mix optional for handler defaults', () => {
    expect(() => contract.validateInput(input, provenance)).not.toThrow();
  });

  it.each([
    [{ dateRange: { start: '2026-09-23' } }, '$.dateRange.end'],
    [{ dateRange: { end: '2026-09-30' } }, '$.dateRange.start'],
    [
      { dateRange: { end: '2026-09-30', start: 123 } },
      '$.dateRange.start: must be string',
    ],
    [
      { dateRange: { end: '2026-09-30', start: '2026-09-23', extra: true } },
      '$.dateRange.extra',
    ],
    [
      { contentMix: { imagePercent: '100' } },
      '$.contentMix.imagePercent: must be number',
    ],
    [
      { contentMix: { unsupportedPercent: 100 } },
      '$.contentMix.unsupportedPercent',
    ],
  ])('rejects invalid nested inputs: %j', (invalid, errorPath) => {
    expect(() =>
      contract.validateInput({ ...input, ...invalid }, provenance),
    ).toThrow(errorPath);
  });
});
