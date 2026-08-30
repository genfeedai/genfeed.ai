import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8',
  );
}

describe('agent runtime workflow registration contract', () => {
  it('registers every agent action executor during module initialization', () => {
    const executionSource = source(
      './agent-turn-workflow-execution.service.ts',
    );

    expect(executionSource).toContain('implements OnModuleInit');
    for (const actionId of [
      'INPUT_RESPONSE',
      'TURN_FAIL',
      'TURN_FINALIZE',
      'TURN_INFER',
      'TURN_PREPARE',
      'UI_ACTION',
    ]) {
      expect(executionSource).toMatch(
        new RegExp(
          `registerAction\\(\\s*AGENT_RUNTIME_ACTION_IDS\\.${actionId}`,
        ),
      );
    }
  });

  it('constructs the execution service in the agent orchestrator module', () => {
    const moduleSource = source(
      '../../../../api/src/services/agent-orchestrator/agent-orchestrator.module.ts',
    );

    expect(moduleSource).toContain(
      "from '@server/services/agent-orchestrator/agent-turn-workflow-execution.service'",
    );
    expect(moduleSource).toMatch(
      /providers:\s*\[[\s\S]*AgentTurnWorkflowExecutionService[\s\S]*\]/,
    );
  });
});
