import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  isCodeRenderedMotionPrompt,
  isExplicitAgentMediaGenerationMode,
} from '@genfeedai/contracts';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';

/**
 * Motion graphics, animated logos or titles, kinetic typography and renderer-named
 * requests are coded visual projects. A provider video model would silently bill
 * an ordinary clip of another length, so the agent is sent to the visual-code
 * tools instead. Picking Video in the composer, or confirming a card, is the
 * person choosing a provider video, so those runs are left alone.
 */
export function codeRenderedMotionVideoError(
  prompt: unknown,
  ctx: Pick<ToolExecutionContext, 'confirmationOrigin' | 'generationMode'>,
): AgentToolResult | null {
  if (
    isExplicitAgentMediaGenerationMode(ctx.generationMode) ||
    ctx.confirmationOrigin === 'thread-ui-action' ||
    typeof prompt !== 'string' ||
    !isCodeRenderedMotionPrompt(prompt)
  ) {
    return null;
  }
  return {
    creditsUsed: 0,
    error:
      'This asks for code-rendered motion, not a provider video. Call quote_visual_code_generation, then generate_visual_code after the person approves the quote, and keep the requested duration. If the renderer is unavailable, say so. Only run a provider video when the person picked Video in the composer.',
    success: false,
  };
}
