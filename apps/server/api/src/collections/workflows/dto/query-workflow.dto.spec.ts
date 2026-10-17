import { WorkflowQueryDto } from '@api/collections/workflows/dto/query-workflow.dto';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

const workflowId = '550e8400-e29b-41d4-a716-446655440003';

function validateIds(ids: unknown) {
  const query = plainToInstance(WorkflowQueryDto, { ids });
  return {
    query,
    errors: validateSync(query).filter((error) => error.property === 'ids'),
  };
}

describe('WorkflowQueryDto ids', () => {
  it('accepts a repeated-key array or a single workflow entity id', () => {
    expect(validateIds(workflowId).query.ids).toEqual([workflowId]);
    expect(validateIds(workflowId).errors).toEqual([]);
    expect(validateIds(['cm123456789abcdef', workflowId]).errors).toEqual([]);
    expect(validateIds(undefined).errors).toEqual([]);
  });

  it('accepts up to 50 ids and rejects an oversized query', () => {
    const ids = Array.from({ length: 51 }, (_, index) => `cworkflow${index}`);
    expect(validateIds(ids.slice(0, 50)).errors).toEqual([]);
    expect(validateIds(ids).errors).not.toEqual([]);
  });

  it.each(
    [
      null,
      '',
      42,
      { in: [workflowId] },
      ['invalid'],
      [workflowId, workflowId],
    ].map((ids) => ({ ids })),
  )('rejects malformed or duplicate ids: $ids', ({ ids }) =>
    expect(validateIds(ids).errors).not.toEqual([]),
  );
});
