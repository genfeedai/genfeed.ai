import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentCampaignsController } from '@api/collections/agent-campaigns/controllers/agent-campaigns.controller';
import { AgentMemoriesController } from '@api/collections/agent-memories/controllers/agent-memories.controller';
import { AgentStrategiesController } from '@api/collections/agent-strategies/controllers/agent-strategies.controller';
import { AgentStrategyWorkflowRunService } from '@api/collections/agent-strategies/services/agent-strategy-workflow-run.service';
import { AgentThreadsController } from '@api/collections/agent-threads/controllers/agent-threads.controller';
import { AgentTransfersController } from '@api/collections/agent-transfers/controllers/agent-transfers.controller';
import { ContextsController } from '@api/collections/contexts/controllers/contexts.controller';
import { KnowledgeSourcesController } from '@api/collections/contexts/controllers/knowledge-sources.controller';
import { KnowledgeRecordsService } from '@api/collections/contexts/services/knowledge-records.service';
import { TENANT_READ_AUTOMATION_ROUTES } from '@api/collections/contexts/utils/tenant-read-automation.registry';
import { ImagesQueryDto } from '@api/collections/images/dto/images-query.dto';
import { PersonaGrantsController } from '@api/collections/personas/controllers/persona-grants.controller';
import { PersonasContentController } from '@api/collections/personas/controllers/personas-content.controller';
import { SkillsController } from '@api/collections/skills/controllers/skills.controller';
import { SkillLibraryService } from '@api/collections/skills/services/skill-library.service';
import { TrainingsOperationsController } from '@api/collections/trainings/controllers/operations/trainings-operations.controller';
import { WorkflowBuilderController } from '@api/collections/workflows/controllers/workflow-builder.controller';
import { WorkflowCrudController } from '@api/collections/workflows/controllers/workflow-crud.controller';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { TenantContextInterceptor } from '@api/helpers/interceptors/tenant-context/tenant-context.interceptor';
import { TENANT_READ_POLICY } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { runWithTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { KnowledgeMemoryScope } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { testId } from '@helpers/testing/test-id.helper';
import type { ExecutionContext } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import type { Request } from 'express';
import { defer, firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: (
    _request: unknown,
    _serializer: unknown,
    data: unknown,
  ) => data,
  serializeSingle: (_request: unknown, _serializer: unknown, data: unknown) =>
    data,
}));
const originalOrg = testId('org');
const selectedOrg = testId('org', 2);
const selectedBrand = testId('brand', 2);
const user: AuthenticatedUser = {
  id: 'real-opaque-user',
  userId: 'real-opaque-user',
  organizationId: originalOrg,
  brandId: testId('brand'),
  isSuperAdmin: true,
};
const request = {} as Request;
const scope = {
  organizationId: selectedOrg,
  brandId: selectedBrand,
  isOrganizationOverride: true,
};
const interceptor = new TenantContextInterceptor();
function context(
  handler: (...args: never[]) => unknown,
  query: Record<string, unknown>,
): ExecutionContext {
  return {
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', user, query }),
    }),
  } as unknown as ExecutionContext;
}
function selected<T>(work: () => T): T {
  return runWithTenantReadScope(scope, work);
}
function instance<T extends object>(
  controller: { prototype: T },
  services: Record<string, unknown>,
): T {
  return Object.assign(Object.create(controller.prototype), services) as T;
}
const target = { id: testId('context', 2), organizationId: selectedOrg };
const original = { id: testId('context'), organizationId: originalOrg };
function rowFor(org: string) {
  return org === selectedOrg ? target : original;
}

describe('automation tenant read ledger', () => {
  it('enumerates exactly 61 actual aliases across 32 controller files', () => {
    expect(TENANT_READ_AUTOMATION_ROUTES).toHaveLength(61);
    expect(
      new Set(TENANT_READ_AUTOMATION_ROUTES.map((entry) => entry.controller))
        .size,
    ).toBe(32);
    const routes = TENANT_READ_AUTOMATION_ROUTES.map((entry) => entry.route);
    expect(new Set(routes).size).toBe(61);
    for (const entry of TENANT_READ_AUTOMATION_ROUTES) {
      const handler = Reflect.get(
        entry.controller.prototype,
        entry.handler,
      ) as (...args: never[]) => unknown;
      expect(Reflect.getMetadata(TENANT_READ_POLICY, handler)).toBe(
        entry.policy,
      );
      const prefixes = [
        Reflect.getMetadata(PATH_METADATA, entry.controller),
      ].flat() as string[];
      const paths = [
        Reflect.getMetadata(PATH_METADATA, handler),
      ].flat() as string[];
      const actual = prefixes.flatMap((prefix) =>
        paths.map((path) =>
          `/v1/${prefix}/${path}`
            .replace(/\/+/g, '/')
            .replace(/\/$/, '')
            .replace(/:(\w+)/g, '{$1}'),
        ),
      );
      expect(actual).toContain(entry.route);
    }
  });
  for (const entry of TENANT_READ_AUTOMATION_ROUTES.filter(
    (entry) => entry.policy !== 'selected',
  )) {
    it(`${entry.controller.name}.${entry.handler} rejects foreign organization before any handler call and permits absent/equal`, async () => {
      const handler = Reflect.get(
        entry.controller.prototype,
        entry.handler,
      ) as (...args: never[]) => unknown;
      const next = { handle: vi.fn(() => of('original-handler')) };
      expect(() =>
        interceptor.intercept(
          context(handler, { organizationId: selectedOrg }),
          next,
        ),
      ).toThrow(expect.objectContaining({ status: 403 }));
      expect(next.handle).not.toHaveBeenCalled();
      for (const query of [{}, { organizationId: originalOrg }]) {
        expect(
          await firstValueFrom(
            interceptor.intercept(context(handler, query), next),
          ),
        ).toBe('original-handler');
      }
      expect(next.handle).toHaveBeenCalledTimes(2);
    });
  }
});

describe('automation selected data and immutable actor', () => {
  it('campaign status returns selected data through the actual interceptor', async () => {
    const getStatus = vi.fn((_id: string, org: string) =>
      Promise.resolve(rowFor(org)),
    );
    const controller = instance(AgentCampaignsController, {
      executionService: { getStatus },
    });
    const result = await firstValueFrom(
      interceptor.intercept(
        context(AgentCampaignsController.prototype.getCampaignStatus, {
          organizationId: selectedOrg,
        }),
        {
          handle: () =>
            defer(() => controller.getCampaignStatus(testId('campaign'), user)),
        },
      ),
    );
    expect(result).toEqual(target);
    expect(getStatus).toHaveBeenCalledWith(testId('campaign'), selectedOrg);
    expect(user.organizationId).toBe(originalOrg);
  });
  it('strategy performance and workflow preview select data without creating a workflow', async () => {
    const getPerformanceSnapshot = vi.fn((_id: string, org: string) =>
      rowFor(org),
    );
    const preview = vi.fn((_id: string, org: string) => rowFor(org));
    const controller = instance(AgentStrategiesController, {
      agentStrategyAutopilotService: { getPerformanceSnapshot },
      agentStrategyWorkflowRunService: { preview },
    });
    expect(
      await selected(() => controller.performanceSnapshot('strategy', user)),
    ).toEqual(target);
    expect(
      await selected(() => controller.workflowBinding('strategy', user)),
    ).toEqual(target);
    expect(preview).toHaveBeenCalledWith('strategy', selectedOrg);
  });
  it('contexts select organization data', async () => {
    const findOne = vi.fn((_id: string, org: string) => rowFor(org));
    const controller = instance(ContextsController, {
      contextsService: { findOne },
    });
    expect(
      await selected(() => controller.findOne(request, 'context', user)),
    ).toEqual(target);
  });
  it('knowledge keeps real PERSONAL ownership while constraining ORG and BRAND to selected data', async () => {
    const findMany = vi.fn(
      async (query: { where: { organizationId: string } }) => [
        rowFor(query.where.organizationId),
      ],
    );
    const count = vi.fn(async (_query: Record<string, unknown>) => 1);
    const prisma = {
      knowledgeSource: { findMany, count },
      $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
    } as unknown as PrismaService;
    const records = new KnowledgeRecordsService(prisma);
    const controller = instance(KnowledgeSourcesController, { records });
    expect(
      await selected(() =>
        controller.list(request, user, { page: 1, limit: 10 }, selectedBrand),
      ),
    ).toEqual(expect.objectContaining({ docs: [target] }));
    expect(findMany).toHaveBeenCalled();
    const where = findMany.mock.calls[0]?.[0];
    expect(where).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: selectedOrg,
          isDeleted: false,
          OR: expect.arrayContaining([
            expect.objectContaining({
              scope: KnowledgeMemoryScope.ORG,
              brandId: null,
            }),
            expect.objectContaining({
              scope: KnowledgeMemoryScope.PERSONAL,
              userId: user.userId,
              brandId: null,
            }),
            expect.objectContaining({
              scope: KnowledgeMemoryScope.BRAND,
              brandId: selectedBrand,
            }),
          ]),
        }),
      }),
    );
  });
  it('skill grant presentation uses selected data and the real user', async () => {
    const getSkillById = vi.fn(async (org: string) => rowFor(org));
    const present = vi.fn(async (_actor: unknown, rows: unknown[]) => rows);
    const controller = instance(SkillsController, {
      skillsService: { getSkillById },
      skillLibrary: { present },
    });
    expect(
      await selected(() => controller.getSkill(request, user, 'skill')),
    ).toEqual(target);
    expect(getSkillById).toHaveBeenCalledWith(
      selectedOrg,
      'skill',
      user.userId,
    );
    expect(present).toHaveBeenCalledWith(
      {
        organizationId: selectedOrg,
        brandId: selectedBrand,
        userId: user.userId,
      },
      [target],
    );
  });
  it('persona posts select data while leaving generation helper default identity intact', async () => {
    const findAll = vi.fn(async (where: { organizationId: string }) => ({
      docs: [rowFor(where.organizationId)],
    }));
    const generatePhoto = vi.fn(async () => 'generated');
    const controller = instance(PersonasContentController, {
      postsService: { findAll },
      personaContentService: { generatePhoto },
    });
    expect(
      await selected(() =>
        controller.getPersonaPosts(request, testId('persona'), 1, 10, user),
      ),
    ).toEqual({ docs: [target] });
    expect(findAll).toHaveBeenLastCalledWith(
      {
        isDeleted: false,
        organizationId: selectedOrg,
        personaId: testId('persona'),
      },
      { limit: 10, page: 1 },
    );
    expect(
      await controller.getPersonaPosts(request, testId('persona'), 1, 10, user),
    ).toEqual({ docs: [original] });
    expect(findAll).toHaveBeenLastCalledWith(
      {
        isDeleted: false,
        organizationId: originalOrg,
        personaId: testId('persona'),
      },
      { limit: 10, page: 1 },
    );
    findAll.mockClear();
    await expect(
      runWithTenantReadScope(
        { organizationId: selectedOrg, isOrganizationOverride: true },
        () =>
          controller.getPersonaPosts(request, testId('persona'), 1, 10, user),
      ),
    ).rejects.toMatchObject({
      status: 422,
      response: { detail: 'brandId is required and must be a string' },
    });
    expect(findAll).not.toHaveBeenCalled();
    await selected(() => controller.generatePhoto(testId('persona'), {}, user));
    expect(generatePhoto).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: originalOrg,
        userId: user.userId,
      }),
    );
  });
  it('training image and source child reads all use selected top-level guards with original owner OR', async () => {
    const findOne = vi.fn(async (_query: Record<string, unknown>) => ({
      id: testId('training'),
      model: 'model',
      sources: [testId('ingredient')],
    }));
    const metadataRows = [
      {
        id: testId('metadata'),
        model: 'model',
        isDeleted: false,
        ingredients: [{ organizationId: selectedOrg, isDeleted: false }],
      },
      {
        id: testId('metadata', 2),
        model: 'model',
        isDeleted: false,
        ingredients: [{ organizationId: originalOrg, isDeleted: false }],
      },
      {
        id: testId('metadata', 3),
        model: 'model',
        isDeleted: false,
        ingredients: [{ organizationId: selectedOrg, isDeleted: true }],
      },
      {
        id: testId('metadata', 4),
        model: 'model',
        isDeleted: false,
        ingredients: [],
      },
      {
        id: testId('metadata', 5),
        model: 'model',
        isDeleted: true,
        ingredients: [{ organizationId: selectedOrg, isDeleted: false }],
      },
    ];
    const metadataFindAll = vi.fn(
      async (query: Prisma.MetadataFindManyArgs) => {
        const parent = query.where?.ingredients?.some;
        return {
          docs: metadataRows
            .filter(
              (row) =>
                row.model === query.where?.model &&
                row.isDeleted === query.where?.isDeleted &&
                parent &&
                row.ingredients.some(
                  (ingredient) =>
                    ingredient.organizationId === parent.organizationId &&
                    ingredient.isDeleted === parent.isDeleted,
                ),
            )
            .map((row) => ({ id: row.id })),
        };
      },
    );
    const ingredientsFindAll = vi.fn(
      async (_query: Record<string, unknown>) => ({ docs: [target] }),
    );
    const controller = instance(TrainingsOperationsController, {
      trainingsService: { findOne },
      metadataService: { findAll: metadataFindAll },
      ingredientsService: { findAll: ingredientsFindAll },
    });
    expect(
      await selected(() =>
        controller.getTrainingImages(
          request,
          user,
          testId('training'),
          new ImagesQueryDto(),
        ),
      ),
    ).toEqual({ docs: [target] });
    expect(
      await selected(() =>
        controller.getTrainingSources(
          request,
          user,
          testId('training'),
          new BaseQueryDto(),
        ),
      ),
    ).toEqual({ docs: [target] });
    for (const call of findOne.mock.calls)
      expect(call[0]).toEqual(
        expect.objectContaining({
          organizationId: selectedOrg,
          isDeleted: false,
          OR: [{ userId: user.userId }, { organizationId: selectedOrg }],
        }),
      );
    expect(metadataFindAll.mock.calls[0]?.[0]).toEqual({
      where: {
        model: 'model',
        isDeleted: false,
        ingredients: {
          some: { organizationId: selectedOrg, isDeleted: false },
        },
      },
    });
    expect(metadataFindAll.mock.calls[0]?.[0].where).not.toHaveProperty(
      'organizationId',
    );
    expect(ingredientsFindAll.mock.calls[0]?.[0]).toEqual({
      where: expect.objectContaining({
        metadataId: { in: [testId('metadata')] },
      }),
    });
    for (const call of ingredientsFindAll.mock.calls)
      expect(call[0]).toEqual({
        where: expect.objectContaining({
          organizationId: selectedOrg,
          isDeleted: false,
        }),
      });
    metadataFindAll.mockResolvedValueOnce({ docs: [] });
    ingredientsFindAll.mockClear();
    expect(
      await selected(() =>
        controller.getTrainingImages(
          request,
          user,
          testId('training'),
          new ImagesQueryDto(),
        ),
      ),
    ).toEqual({ docs: [] });
    expect(ingredientsFindAll).not.toHaveBeenCalled();
  });
  it('workflow visible and organization-only interface preserve their distinct ownership predicates', async () => {
    const findVisibleOrThrow = vi.fn(
      async (_id: string, identity: { organizationId: string }) => ({
        ...rowFor(identity.organizationId),
        nodes: [],
      }),
    );
    const findOwnedOrThrow = vi.fn(async () => ({
      nodes: [],
      inputVariables: [],
    }));
    const crud = instance(WorkflowCrudController, {
      workflowsService: { findVisibleOrThrow },
    });
    const builder = instance(WorkflowBuilderController, {
      workflowsService: { findOwnedOrThrow },
    });
    const visible = await selected(() =>
      crud.findOne(request, 'workflow', user),
    );
    expect(visible).toEqual(expect.objectContaining(target));
    expect(findVisibleOrThrow).toHaveBeenCalledWith('workflow', {
      organizationId: selectedOrg,
      userId: user.userId,
    });
    expect(
      await selected(() => builder.getWorkflowInterface('workflow', user)),
    ).toEqual({ data: { inputs: {}, outputs: {} } });
    expect(findOwnedOrThrow).toHaveBeenCalledWith('workflow', {
      organizationId: selectedOrg,
    });
  });
});

describe('original ownership regressions', () => {
  it('owner memory and thread calls retain original user and organization even inside a selected scope', async () => {
    const listForUser = vi.fn(async () => []);
    const listPersonalForUser = vi.fn(async () => []);
    const getUserThreads = vi.fn(async () => []);
    const memories = instance(AgentMemoriesController, {
      memoriesService: { listForUser, listPersonalForUser },
    });
    const threads = instance(AgentThreadsController, {
      agentThreadsService: { getUserThreads },
    });
    await selected(() => memories.list(request, user));
    await selected(() => memories.listPersonal(request, user));
    await selected(() => threads.listThreads(request, user));
    expect(listForUser).toHaveBeenCalledWith(user.userId, originalOrg);
    expect(listPersonalForUser).toHaveBeenCalledWith(user.userId, originalOrg);
    expect(getUserThreads).toHaveBeenCalledWith(
      user.userId,
      originalOrg,
      undefined,
      undefined,
      undefined,
    );
  });
  it('owner transfer discovery retains original actor', async () => {
    const discoverConversations = vi.fn(async () => []);
    const transfers = instance(AgentTransfersController, {
      agentTransfersService: { discoverConversations },
    });
    await selected(() =>
      transfers.discoverConversations(request, user, 'source'),
    );
    expect(discoverConversations).toHaveBeenCalledWith(
      { organizationId: originalOrg, userId: user.userId },
      'source',
      undefined,
      undefined,
    );
  });
  it('unchanged persona grants reject foreign selection before the service', async () => {
    const listForPersona = vi.fn();
    const grants = instance(PersonaGrantsController, {
      grantsService: { listForPersona },
    });
    await expect(
      grants.listGrants(user, testId('persona'), selectedOrg),
    ).rejects.toMatchObject({ status: 403 });
    expect(listForPersona).not.toHaveBeenCalled();
    await grants.listGrants(user, testId('persona'), originalOrg);
    expect(listForPersona).toHaveBeenCalledWith({
      organizationId: originalOrg,
      brandId: user.brandId,
      personaId: testId('persona'),
    });
  });
});

describe('unchanged read-only workflow service contracts', () => {
  it('strategy preview does not install a missing bound template', async () => {
    const findOneById = vi.fn(async () => ({
      id: 'strategy',
      userId: user.userId,
      brandId: selectedBrand,
      organizationId: selectedOrg,
      label: 'Strategy',
      config: { preferredWorkflowTemplateId: 'missing-template' },
    }));
    const findMany = vi.fn(async () => []);
    const create = vi.fn();
    const service = instance(AgentStrategyWorkflowRunService, {
      agentStrategiesService: { findOneById },
      workflowsService: { create },
      prisma: { workflow: { findMany } },
    });
    const controller = instance(AgentStrategiesController, {
      agentStrategyWorkflowRunService: service,
    });
    const result = await selected(() =>
      controller.workflowBinding('strategy', user),
    );
    expect(result).toEqual(
      expect.objectContaining({
        preferredWorkflowTemplateId: 'missing-template',
        workflowId: null,
      }),
    );
    expect(findOneById).toHaveBeenCalledWith('strategy', selectedOrg);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: selectedOrg,
          isDeleted: false,
          brandId: selectedBrand,
        }),
      }),
    );
    expect(create).not.toHaveBeenCalled();
  });
  it('workflow service retains the original owner OR organization-visible-system predicate', async () => {
    const findOne = vi.fn(async (where: { organizationId: string }) => ({
      ...rowFor(where.organizationId),
      nodes: [],
    }));
    const service = instance(WorkflowsService, { findOne });
    const crud = instance(WorkflowCrudController, {
      workflowsService: service,
    });
    expect(
      await selected(() => crud.findOne(request, 'workflow', user)),
    ).toEqual(expect.objectContaining(target));
    expect(findOne).toHaveBeenCalledWith({
      id: 'workflow',
      organizationId: selectedOrg,
      OR: [
        { userId: user.userId },
        {
          metadata: {
            equals: 'organization',
            path: [expect.any(String), 'visibility'],
          },
        },
      ],
    });
    const builder = instance(WorkflowBuilderController, {
      workflowsService: service,
    });
    await selected(() => builder.getWorkflowInterface('workflow', user));
    expect(findOne).toHaveBeenLastCalledWith({
      id: 'workflow',
      organizationId: selectedOrg,
    });
  });
});

describe('actual skill capability and grant preservation', () => {
  it('honors real-user read grants without fabricating selected organization membership', async () => {
    const memberFindFirst = vi.fn(
      async (_query: Record<string, unknown>) => null,
    );
    const grantFindMany = vi.fn(async (_query: Record<string, unknown>) => [
      {
        skillId: target.id,
        skillVersionId: 'version',
        access: 'use_and_read',
        recipientKind: 'user',
        recipientUserId: user.userId,
        recipientOrganizationId: null,
        recipientBrandId: null,
        revokedAt: null,
      },
    ]);
    const assignmentFindMany = vi.fn(async () => []);
    const versionFindMany = vi.fn(async () => [
      {
        id: 'version',
        skillId: target.id,
        instructionText: 'Granted content',
        contentHash: 'hash',
      },
    ]);
    const prisma = {
      member: { findFirst: memberFindFirst },
      skillGrant: { findMany: grantFindMany },
      skillAssignment: { findMany: assignmentFindMany },
      skillVersion: { findMany: versionFindMany },
    } as unknown as PrismaService;
    const library = new SkillLibraryService(prisma);
    const document = {
      ...target,
      ownerKind: 'organization',
      ownerUserId: null,
      audience: 'private',
      brandId: null,
      isQuarantined: false,
      config: {},
      source: 'custom',
    };
    const getSkillById = vi.fn(async (org: string) =>
      org === selectedOrg ? document : { ...document, ...original },
    );
    const controller = instance(SkillsController, {
      skillsService: { getSkillById },
      skillLibrary: library,
    });
    expect(
      await selected(() => controller.getSkill(request, user, 'skill')),
    ).toEqual(
      expect.objectContaining({
        ...target,
        canRead: true,
        canUse: true,
        canEdit: false,
      }),
    );
    expect(memberFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: selectedOrg,
          userId: user.userId,
          isActive: true,
          isDeleted: false,
        },
      }),
    );
    expect(grantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { recipientKind: 'user', recipientUserId: user.userId },
            {
              recipientKind: 'organization',
              recipientOrganizationId: selectedOrg,
            },
            {
              recipientKind: 'brand',
              recipientBrandId: selectedBrand,
              recipientOrganizationId: selectedOrg,
            },
          ]),
        }),
      }),
    );
  });
});
