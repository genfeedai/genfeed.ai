import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SystemWorkflowDefinitionRegistrarService } from '@api/collections/workflows/services/system-workflow-definition-registrar.service';
import { describe, expect, it, vi } from 'vitest';

const registrarSource = readFileSync(
  fileURLToPath(
    new URL(
      './system-workflow-definition-registrar.service.ts',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('system workflow definition registrar contract', () => {
  it('registers the agent runtime workflows at application startup', () => {
    expect(registrarSource).toMatch(
      /import\s+\{\s*AGENT_RUNTIME_WORKFLOW_DEFINITIONS\s*\}\s+from\s+'@api\/collections\/workflows\/services\/agent-runtime-workflow-definitions'/,
    );
    expect(registrarSource).toContain('...AGENT_RUNTIME_WORKFLOW_DEFINITIONS');
  });
});

it('leaves the analytics parent to its domain owner while retaining shared graphs', () => {
  const runner = { registerWorkflow: vi.fn() };
  new SystemWorkflowDefinitionRegistrarService(runner as never).onModuleInit();
  const definitions = runner.registerWorkflow.mock.calls.map(
    ([definition]) => definition,
  );
  expect(
    definitions.some(
      (definition) => definition.canonicalId === 'analytics-sync',
    ),
  ).toBe(false);
  expect(
    definitions.find(
      (definition) => definition.canonicalId === 'content-loop-autopilot',
    ).definition.nodes,
  ).not.toHaveLength(0);
  expect(
    definitions.filter(
      (definition) => definition.canonicalId === 'agent.autopilot.proactive',
    ),
  ).toHaveLength(1);
});
