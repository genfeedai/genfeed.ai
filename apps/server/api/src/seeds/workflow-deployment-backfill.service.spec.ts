import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('WorkflowDeploymentBackfillService', () => {
  it('does not clone or unpause Daily Trends Digest on every hosted SaaS deploy', () => {
    const source = readFileSync(
      resolve(__dirname, 'workflow-deployment-backfill.service.ts'),
      'utf8',
    );

    expect(source).not.toContain('ensureDailyTrendsDigestWorkflow');
  });
});
