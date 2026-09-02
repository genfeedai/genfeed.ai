import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ingestionSource = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    './services/social-inbox-ingestion.service.ts',
  ),
  'utf8',
);
const moduleSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'social-inbox.module.ts'),
  'utf8',
);

describe('SocialInbox workflow-queue lookup', () => {
  it('does not import fat WorkflowsModule (that would close a ring)', () => {
    expect(moduleSource).toContain('WorkflowsCoreModule');
    expect(moduleSource).not.toContain(
      "from '@api/collections/workflows/workflows.module'",
    );
  });

  it('resolves WorkflowExecutionQueueService through ModuleRef', () => {
    expect(ingestionSource).toContain('ModuleRef');
    expect(ingestionSource).toContain(
      'this.moduleRef.get(WorkflowExecutionQueueService',
    );
  });
});
