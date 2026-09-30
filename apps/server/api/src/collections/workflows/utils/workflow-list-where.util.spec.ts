import { SYSTEM_WORKFLOW_METADATA_KEY } from '@api/collections/workflows/system-workflow.contract';
import {
  buildWorkflowListWhere,
  EXCLUDE_SYSTEM_WORKFLOW,
} from '@api/collections/workflows/utils/workflow-list-where.util';
import { Prisma } from '@genfeedai/prisma';
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
            { metadata: { equals: Prisma.AnyNull } },
            {
              metadata: {
                equals: Prisma.AnyNull,
                path: [SYSTEM_WORKFLOW_METADATA_KEY, 'kind'],
              },
            },
            {
              NOT: {
                metadata: {
                  equals: 'system-workflow',
                  path: [SYSTEM_WORKFLOW_METADATA_KEY, 'kind'],
                },
              },
            },
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
