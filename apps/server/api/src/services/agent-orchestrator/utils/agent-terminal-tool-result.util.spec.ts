import { resolveTerminalToolOutcome } from '@api/services/agent-orchestrator/utils/agent-terminal-tool-result.util';
import type {
  AgentToolResult,
  AgentUiAction,
} from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

const card: AgentUiAction = {
  id: 'card',
  title: 'Generate turbo content',
  type: 'mutation_approval_card',
};

describe('resolveTerminalToolOutcome', () => {
  it('ends the turn while a mutation approval is pending', () => {
    const result: AgentToolResult = {
      approvalStatus: 'pending',
      creditsUsed: 0,
      nextActions: [card],
      requiresConfirmation: true,
      success: true,
    };

    expect(
      resolveTerminalToolOutcome('generate_turbo_content', {}, result),
    ).toEqual({
      content: 'Review the details and approve to continue.',
      toolName: 'generate_turbo_content',
    });
  });

  it('keeps the turn open for a plain successful result', () => {
    expect(
      resolveTerminalToolOutcome(
        'generate_turbo_content',
        {},
        { creditsUsed: 0, success: true },
      ),
    ).toBeUndefined();
  });

  it('ends the turn when a tool waits for input', () => {
    expect(
      resolveTerminalToolOutcome(
        'request_input',
        {},
        { creditsUsed: 0, data: { waitingForInput: true }, success: true },
      ),
    ).toEqual({
      content: 'Choose an option to continue.',
      toolName: 'request_input',
    });
  });
});
