import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { getToolByName } from '@genfeedai/actions';

interface AgentToolInvocation {
  context: ToolExecutionContext;
  parameters: Record<string, unknown>;
}

/**
 * `brandId` is how a caller names the brand a call acts in, and MCP clients
 * and agents pass it on every tool. Most tools do not declare it: they run
 * in the call's brand scope. A tool's action contract is closed, so an
 * undeclared `brandId` failed the whole run ("must NOT have additional
 * properties") although the executor already authorizes it.
 *
 * For a tool that does not declare `brandId`, move it from the parameters to
 * the call's brand scope, where the tool reads it. The executor authorizes
 * the brand in either place, and a declared `brandId` stays a parameter.
 */
export function moveUndeclaredBrandArgument(
  toolName: string,
  invocation: AgentToolInvocation,
): AgentToolInvocation {
  const { brandId, ...rest } = invocation.parameters;
  const isDeclared = Boolean(
    getToolByName(toolName)?.parameters.properties.brandId,
  );
  if (isDeclared || typeof brandId !== 'string') return invocation;

  const trimmed = brandId.trim();
  return {
    context: trimmed
      ? { ...invocation.context, brandId: trimmed }
      : invocation.context,
    parameters: rest,
  };
}
