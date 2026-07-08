import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource() {
  return readFileSync(
    join(process.cwd(), 'agent/agent-page-content.tsx'),
    'utf8',
  );
}

describe('agent-page-content.tsx', () => {
  it('exports a component', () => {
    expect(readSource()).toContain('export default function AgentPageContent');
  });

  it('routes non-EE credit actions to credits settings', () => {
    const source = readSource();

    expect(source).toContain("'/settings/credits'");
    expect(source).not.toContain(
      "isEEEnabled() ? '/settings/billing' : '/settings/api-keys'",
    );
  });
});
