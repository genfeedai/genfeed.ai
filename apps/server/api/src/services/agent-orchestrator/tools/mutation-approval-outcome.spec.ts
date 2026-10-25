import { buildApprovedMutationOutcome } from '@api/services/agent-orchestrator/tools/mutation-approval-outcome';
import { describe, expect, it } from 'vitest';

describe('buildApprovedMutationOutcome', () => {
  it('points a queued turbo run at its live card and the approval queue', () => {
    const outcome = buildApprovedMutationOutcome(
      'generate_turbo_content',
      { brandId: 'brand-1', platforms: ['twitter', 'linkedin'] },
      {
        creditsUsed: 6,
        data: { totalCount: 1, turboRunId: 'run-1' },
        success: true,
      },
    );

    expect(outcome?.content).toContain('Generating 1 post now');
    expect(outcome?.nextActions).toEqual([
      {
        brandId: 'brand-1',
        completedCount: 0,
        creditsUsed: 6,
        ctas: [
          {
            href: '/publishing/posts?view=approvals&run=run-1',
            label: 'Open approval queue',
          },
        ],
        data: { turboRunId: 'run-1' },
        id: 'turbo-run-result:run-1',
        platforms: ['twitter', 'linkedin'],
        status: 'queued',
        title: 'Generating posts',
        turboRunCount: 1,
        type: 'turbo_run_result_card',
      },
    ]);
  });

  it('uses the requested count when the run did not report a total', () => {
    const outcome = buildApprovedMutationOutcome(
      'generate_turbo_content',
      { count: 5 },
      { creditsUsed: 0, data: { turboRunId: 'run-2' }, success: true },
    );

    expect(outcome?.content).toContain('Generating 5 posts now');
  });

  it.each([
    [
      'another tool',
      'create_post',
      { creditsUsed: 0, data: { turboRunId: 'run-1' }, success: true },
    ],
    [
      'a failed run',
      'generate_turbo_content',
      { creditsUsed: 0, error: 'No credits', success: false },
    ],
    [
      'a result without a run',
      'generate_turbo_content',
      { creditsUsed: 0, data: {}, success: true },
    ],
  ])('leaves %s to the generic completion', (_label, toolName, result) => {
    expect(buildApprovedMutationOutcome(toolName, {}, result)).toBeNull();
  });
});
