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
});
