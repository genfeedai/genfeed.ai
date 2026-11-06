import { WorkflowExecutionAuthorizationService } from '@api/collections/workflows/services/workflow-execution-authorization.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

const scope = {
  brandId: 'brand-1',
  contextVersion: 3,
  isLegacyFallback: false,
  isVersionExplicit: true,
  organizationId: 'org-1',
  source: 'explicit',
  threadId: 'thread-1',
  userId: 'user-1',
} as const;

type Workflow = {
  brandId: string;
  id: string;
  isDeleted: boolean;
  organizationId: string;
};

/**
 * Persisted thread scopes at a context version, the workflows table, and a
 * scope validator that refuses stale versions, consequential actions on a
 * legacy scope, and resources of another brand. Prepared turns are recorded.
 */
function buildService(options: { isLegacyScope?: boolean } = {}) {
  const preparedTurns: unknown[] = [];
  const workflows: Workflow[] = [
    {
      brandId: 'brand-1',
      id: 'workflow-1',
      isDeleted: false,
      organizationId: 'org-1',
    },
    {
      brandId: 'brand-2',
      id: 'workflow-other-brand',
      isDeleted: false,
      organizationId: 'org-1',
    },
    {
      brandId: 'brand-1',
      id: 'workflow-other-org',
      isDeleted: false,
      organizationId: 'org-2',
    },
  ];
  const threadScope = {
    ...scope,
    isLegacyFallback: Boolean(options.isLegacyScope),
  };
  const agentScope = {
    assertConsequentialBoundary: async (current: typeof threadScope) => {
      if (current.isLegacyFallback) {
        throw new ForbiddenException(
          'Confirm the brand before running workflows',
        );
      }
    },
    assertResourceBrand: (current: typeof scope, brandId: string) => {
      if (brandId !== current.brandId)
        throw new ForbiddenException('outside scope');
    },
    prepareForTurn: async (turn: {
      expectedContextVersion: number;
      threadId: string;
    }) => {
      preparedTurns.push(turn);
      if (turn.threadId !== scope.threadId) return { existingScope: undefined };
      if (turn.expectedContextVersion !== scope.contextVersion) {
        throw new ConflictException('Thread context changed');
      }
      return { existingScope: threadScope };
    },
  };
  const prisma = {
    workflow: {
      findFirst: async ({ where }: { where: Partial<Workflow> }) =>
        workflows.find(
          (row) =>
            row.id === where.id &&
            row.organizationId === where.organizationId &&
            row.isDeleted === where.isDeleted,
        ) ?? null,
    },
  };
  const service = new WorkflowExecutionAuthorizationService(
    prisma as unknown as PrismaService,
    agentScope as unknown as ConstructorParameters<
      typeof WorkflowExecutionAuthorizationService
    >[1],
  );
  return { preparedTurns, service };
}

const threadRequest = {
  expectedContextVersion: 3,
  organizationId: 'org-1',
  threadId: 'thread-1',
  userId: 'user-1',
  workflowId: 'workflow-1',
};

describe('WorkflowExecutionAuthorizationService', () => {
  it('preserves the direct-route authorization path without shell state', async () => {
    const { preparedTurns, service } = buildService();

    await expect(
      service.authorize({
        organizationId: 'org-1',
        userId: 'user-1',
        workflowId: 'workflow-1',
      }),
    ).resolves.toBeUndefined();
    expect(preparedTurns).toEqual([]);
  });

  it('requires the thread and context version as one authorization unit', async () => {
    const { preparedTurns, service } = buildService();

    await expect(
      service.authorize({
        ...threadRequest,
        expectedContextVersion: undefined,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(preparedTurns).toEqual([]);
  });

  it('returns the validated thread scope for a workflow of the thread brand', async () => {
    const { preparedTurns, service } = buildService();

    await expect(
      service.authorize({ ...threadRequest, requestedBrandId: 'brand-1' }),
    ).resolves.toEqual(expect.objectContaining({ brandId: 'brand-1' }));
    expect(preparedTurns).toEqual([
      {
        expectedContextVersion: 3,
        organizationId: 'org-1',
        requestedBrandId: 'brand-1',
        threadId: 'thread-1',
        userId: 'user-1',
      },
    ]);
  });

  it.each([
    [
      'a stale context version',
      { expectedContextVersion: 2 },
      {},
      ConflictException,
    ],
    [
      'a thread without saved context',
      { threadId: 'thread-unknown' },
      {},
      BadRequestException,
    ],
    ['a legacy scope', {}, { isLegacyScope: true }, ForbiddenException],
    [
      'a workflow of another brand',
      { workflowId: 'workflow-other-brand' },
      {},
      ForbiddenException,
    ],
    [
      'a workflow of another organization',
      { workflowId: 'workflow-other-org' },
      {},
      NotFoundException,
    ],
  ])('refuses %s before execution', async (_case, override, options, error) => {
    const { service } = buildService(options);

    await expect(
      service.authorize({ ...threadRequest, ...override }),
    ).rejects.toBeInstanceOf(error);
  });
});
