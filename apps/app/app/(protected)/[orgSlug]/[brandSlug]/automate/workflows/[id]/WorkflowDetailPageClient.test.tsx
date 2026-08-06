import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertSourceHasExport } from '@shared/pages/sourceContractTestUtils';
import { describe, expect, it } from 'vitest';

const relativePath =
  'app/(protected)/[orgSlug]/[brandSlug]/automate/workflows/[id]/WorkflowDetailPageClient.tsx';

assertSourceHasExport(relativePath);

describe(relativePath, () => {
  it('uses the canonical execution id for the active run', () => {
    const source = readFileSync(join(process.cwd(), relativePath), 'utf8');

    expect(source).toContain('setActiveExecutionId(execution.id)');
    expect(source).not.toContain('execution._id');
  });

  it('tracks bounded workflow start and terminal outcomes', () => {
    const source = readFileSync(join(process.cwd(), relativePath), 'utf8');

    expect(source).toContain('ANALYTICS_EVENTS.WORKFLOW_RUN_STARTED');
    expect(source).toContain('ANALYTICS_EVENTS.WORKFLOW_RUN_COMPLETED');
    expect(source).toContain("outcome: 'success'");
    expect(source).toContain("outcome: 'failure'");
    expect(source).toContain("workflowType: 'editor'");
  });
});
