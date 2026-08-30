import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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
      /import\s+\{\s*AGENT_RUNTIME_WORKFLOW_DEFINITIONS\s*\}\s+from\s+'@server\/collections\/workflows\/services\/agent-runtime-workflow-definitions'/,
    );
    expect(registrarSource).toContain('...AGENT_RUNTIME_WORKFLOW_DEFINITIONS');
  });
});
