import type { GenerateContentDto } from '@api/collections/content-intelligence/dto/generate-content.dto';
import { toGenerationWorkflowDto } from '@api/collections/content-intelligence/utils/generation-workflow-input.util';
import { getActionDefinition } from '@genfeedai/actions';
import { compileActionContract } from '@genfeedai/workflows/engine';
import { describe, expect, it } from 'vitest';

const PROVENANCE = {
  nodeId: 'load-context',
  runId: 'run',
  workflowId: 'workflow',
  workflowVersionId: 'v1',
};

function compileInputContract(actionId: string) {
  const action = getActionDefinition(actionId);
  return compileActionContract(actionId, {
    inputSchema: (action?.inputSchema ?? {}) as Readonly<
      Record<string, unknown>
    >,
    outputSchema: (action?.outputSchema ?? {}) as Readonly<
      Record<string, unknown>
    >,
  });
}

// What the Agent tool and Nest's plainToInstance hand the generator:
// omitted optional fields are present with an `undefined` value.
const dtoWithUndefinedFields = {
  additionalContext: undefined,
  brandId: undefined,
  knowledge: { purposes: ['BRAND_TRUTH'], sourceIds: undefined },
  platform: 'twitter',
  topic: 'Thursday ship day',
  variationsCount: 1,
} as unknown as GenerateContentDto;

describe('toGenerationWorkflowDto', () => {
  it.each([
    'content-intelligence.load-context',
    'content-intelligence.load-patterns',
  ])('produces a DTO the %s contract accepts', (actionId) => {
    const contract = compileInputContract(actionId);

    expect(() =>
      contract.validateInput({ dto: dtoWithUndefinedFields }, PROVENANCE),
    ).toThrow(/Action contract input validation failed/);
    expect(() =>
      contract.validateInput(
        { dto: toGenerationWorkflowDto(dtoWithUndefinedFields) },
        PROVENANCE,
      ),
    ).not.toThrow();
  });

  it('drops undefined keys recursively and keeps every defined value', () => {
    expect(toGenerationWorkflowDto(dtoWithUndefinedFields)).toEqual({
      knowledge: { purposes: ['BRAND_TRUTH'] },
      platform: 'twitter',
      topic: 'Thursday ship day',
      variationsCount: 1,
    });
    expect(
      Object.keys(toGenerationWorkflowDto(dtoWithUndefinedFields)),
    ).not.toContain('brandId');
  });
});
