import {
  buildWorkflowListWhere,
  EXCLUDE_SYSTEM_WORKFLOW,
} from '@api/collections/workflows/utils/workflow-list-where.util';
import { describe, expect, it } from 'vitest';

const baseInput = {
  isDeleted: false,
  organizationId: 'org-1',
  userId: 'user-1',
};

describe('buildWorkflowListWhere', () => {
  it('scopes the customer library to the selected brand', () => {
    expect(
      buildWorkflowListWhere({
        ...baseInput,
        brandId: 'brand-fud',
        includeSystem: false,
        referencable: false,
      }),
    ).toMatchObject({
      brandId: 'brand-fud',
      userId: 'user-1',
    });
  });

  it('keeps tenant workflows whose metadata is SQL NULL', () => {
    expect(EXCLUDE_SYSTEM_WORKFLOW).toEqual({
      AND: [
        {
          OR: [
            { systemWorkflowKind: null },
            { systemWorkflowKind: { not: 'system-workflow' } },
          ],
        },
      ],
    });
    expect(
      buildWorkflowListWhere({
        ...baseInput,
        includeSystem: false,
        referencable: false,
      }),
    ).toEqual({
      ...EXCLUDE_SYSTEM_WORKFLOW,
      isDeleted: false,
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });

  it('keeps organization-visible system workflows on the admin includeSystem list', () => {
    expect(
      buildWorkflowListWhere({
        ...baseInput,
        includeSystem: true,
        referencable: false,
      }),
    ).toEqual({
      OR: [{ userId: 'user-1' }, { systemWorkflowVisibility: 'organization' }],
      isDeleted: false,
      organizationId: 'org-1',
    });
  });
});
