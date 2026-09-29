import { ReorderFeaturedWorkflowsDto } from '@api/collections/workflows/dto/reorder-featured-workflows.dto';
import { FEATURED_WORKFLOW_LIMIT } from '@genfeedai/contracts/constants';
import { testId } from '@helpers/testing/test-id.helper';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

async function validateDto(body: Record<string, unknown>) {
  return validate(plainToInstance(ReorderFeaturedWorkflowsDto, body));
}

describe('ReorderFeaturedWorkflowsDto (#5511)', () => {
  it('accepts an ordered list of workflow ids', async () => {
    await expect(
      validateDto({ workflowIds: [testId('wf-b'), testId('wf-a')] }),
    ).resolves.toHaveLength(0);
  });

  it('accepts an empty order', async () => {
    await expect(validateDto({ workflowIds: [] })).resolves.toHaveLength(0);
  });

  it.each([
    ['a missing list', {}],
    ['a non-array', { workflowIds: testId('wf-a') }],
    ['a malformed id', { workflowIds: ['not an id'] }],
    [
      'more ids than the row holds',
      {
        workflowIds: Array.from(
          { length: FEATURED_WORKFLOW_LIMIT + 1 },
          (_, i) => testId('wf', i + 1),
        ),
      },
    ],
  ])('rejects %s', async (_, body) => {
    await expect(validateDto(body)).resolves.not.toHaveLength(0);
  });
});
