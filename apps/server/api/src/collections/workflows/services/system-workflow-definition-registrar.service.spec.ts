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

it('registers fallback templates without dropping graph inputs', () => {
  const runner = { registerWorkflow: vi.fn() };
  new SystemWorkflowDefinitionRegistrarService(runner as never).onModuleInit();
  const definitions = runner.registerWorkflow.mock.calls.map(
    ([definition]) => definition,
  );
  const analytics = definitions.find(
    (definition) => definition.canonicalId === 'analytics-sync',
  );
  expect(
    analytics.definition.inputVariables.map(
      (input: { key: string }) => input.key,
    ),
  ).toEqual(['brandId', 'since']);
  expect(
    analytics.definition.nodes.map((node: { id: string }) => node.id),
  ).toContain('sync-each-item');
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
