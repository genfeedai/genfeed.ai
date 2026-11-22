import { moveUndeclaredBrandArgument } from '@api/services/agent-orchestrator/tools/agent-tool-brand-argument.util';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { getActionDefinition, getToolsForSurface } from '@genfeedai/actions';
import { isRecord } from '@genfeedai/contracts/constants/type-guards.constant';
import { compileActionContract } from '@genfeedai/workflows/engine';
import { describe, expect, it } from 'vitest';

const PROVENANCE = {
  nodeId: 'execute-tool',
  runId: 'run_1',
  workflowId: 'agent.tool.request_media_upload',
  workflowVersionId: 'version_1',
};
const CONTEXT: ToolExecutionContext = {
  organizationId: 'org_1',
  userId: 'user_1',
};

const AGENT_TOOLS = getToolsForSurface('agent');
const UNDECLARED_TOOL_NAMES = AGENT_TOOLS.filter(
  (tool) => !tool.parameters.properties.brandId,
).map((tool) => tool.name);
const DECLARED_TOOL_NAMES = AGENT_TOOLS.filter(
  (tool) => tool.parameters.properties.brandId,
).map((tool) => tool.name);

function compileInputContract(actionId: string) {
  const action = getActionDefinition(actionId);
  if (!isRecord(action?.inputSchema) || !isRecord(action?.outputSchema)) {
    throw new Error(`${actionId} must have a contract`);
  }
  return compileActionContract(actionId, {
    inputSchema: action.inputSchema,
    outputSchema: action.outputSchema,
  });
}

/**
 * API-GENFEED-AI-BC: a caller named its brand on request_media_upload, whose
 * closed action contract does not declare `brandId`, so the run failed with
 * "$.brandId: must NOT have additional properties".
 */
describe('moveUndeclaredBrandArgument', () => {
  it('rejects an undeclared brandId in the request_media_upload contract', () => {
    const contract = compileInputContract('request_media_upload');

    expect(() =>
      contract.validateInput(
        { brandId: 'brand_1', contentType: 'image/png', filename: 'a.png' },
        PROVENANCE,
      ),
    ).toThrow('$.brandId: must NOT have additional properties');
  });

  it('hands request_media_upload a contract-valid call in the named brand', () => {
    const { context, parameters } = moveUndeclaredBrandArgument(
      'request_media_upload',
      {
        context: CONTEXT,
        parameters: {
          brandId: ' brand_1 ',
          contentType: 'image/png',
          filename: 'a.png',
        },
      },
    );

    expect(parameters).toEqual({ contentType: 'image/png', filename: 'a.png' });
    expect(context).toEqual({ ...CONTEXT, brandId: 'brand_1' });
    expect(() =>
      compileInputContract('request_media_upload').validateInput(
        parameters,
        PROVENANCE,
      ),
    ).not.toThrow();
  });

  it.each(UNDECLARED_TOOL_NAMES)(
    'moves brandId into the brand scope of %s',
    (toolName) => {
      expect(
        moveUndeclaredBrandArgument(toolName, {
          context: CONTEXT,
          parameters: { brandId: 'brand_1', other: 'kept' },
        }),
      ).toEqual({
        context: { ...CONTEXT, brandId: 'brand_1' },
        parameters: { other: 'kept' },
      });
    },
  );

  it.each(DECLARED_TOOL_NAMES)(
    'leaves brandId a parameter of %s',
    (toolName) => {
      const invocation = {
        context: CONTEXT,
        parameters: { brandId: 'brand_1' },
      };

      expect(moveUndeclaredBrandArgument(toolName, invocation)).toBe(
        invocation,
      );
    },
  );

  it('drops a blank brandId without naming a brand', () => {
    expect(
      moveUndeclaredBrandArgument('request_media_upload', {
        context: CONTEXT,
        parameters: { brandId: '  ', filename: 'a.png' },
      }),
    ).toEqual({ context: CONTEXT, parameters: { filename: 'a.png' } });
  });

  it('leaves a call without brandId untouched', () => {
    const invocation = {
      context: CONTEXT,
      parameters: { filename: 'a.png' },
    };

    expect(
      moveUndeclaredBrandArgument('request_media_upload', invocation),
    ).toEqual(invocation);
  });
});
