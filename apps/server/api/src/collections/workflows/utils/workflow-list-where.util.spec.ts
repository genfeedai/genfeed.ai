import { SYSTEM_WORKFLOW_METADATA_KEY } from '@api/collections/workflows/system-workflow.contract';
import { buildWorkflowListWhere } from '@api/collections/workflows/utils/workflow-list-where.util';
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

  it('excludes persisted system workflows from the customer library', () => {
    expect(
      buildWorkflowListWhere({
        ...baseInput,
        includeSystem: false,
        referencable: false,
      }),
    ).toEqual({
      NOT: {
        metadata: {
          equals: 'system-workflow',
          path: [SYSTEM_WORKFLOW_METADATA_KEY, 'kind'],
        },
      },
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
      OR: [
        { userId: 'user-1' },
        {
          metadata: {
            equals: 'organization',
            path: [SYSTEM_WORKFLOW_METADATA_KEY, 'visibility'],
          },
        },
      ],
      isDeleted: false,
      organizationId: 'org-1',
    });
  });
});
