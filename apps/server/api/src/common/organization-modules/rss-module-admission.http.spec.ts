import { RssSourcesController } from '@api/collections/rss-sources/controllers/rss-sources.controller';
import { RssSourceWorkflowService } from '@api/collections/rss-sources/services/rss-source-workflow.service';
import { RssSourcesService } from '@api/collections/rss-sources/services/rss-sources.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { OrganizationModuleGuard } from '@api/common/organization-modules/organization-module.guard';
import { OrganizationModuleAccessService } from '@api/common/organization-modules/organization-module-access.service';
import { ApiKeyScope } from '@genfeedai/contracts';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';

vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  hasOrganizationBilling: () => true,
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

describe('RSS HTTP Publishing module admission', () => {
  let app: INestApplication;
  let overrides: Map<string, boolean | null>;
  let actorFlags: { isApiKey?: boolean; isSuperAdmin?: boolean };
  const service = {
    createScoped: vi.fn(),
    updateScoped: vi.fn(),
    removeScoped: vi.fn(),
    findOneScoped: vi.fn(),
    findAllScoped: vi.fn(),
  };
  const enqueueSource = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    service.createScoped.mockResolvedValue({ id: 'rss-1' });
    service.updateScoped.mockResolvedValue({ id: 'rss-1' });
    service.removeScoped.mockResolvedValue(undefined);
    service.findOneScoped.mockResolvedValue({ id: 'rss-1' });
    service.findAllScoped.mockResolvedValue([{ id: 'rss-1' }]);
    enqueueSource.mockResolvedValue('rss-job');
    overrides = new Map([
      ['org-1', false],
      ['org-2', false],
    ]);
    actorFlags = {};
    const access = new OrganizationModuleAccessService(
      {
        organization: {
          findFirst: vi.fn(async ({ where }: { where: { id: string } }) => ({
            id: where.id,
          })),
        },
        organizationSetting: {
          findUnique: vi.fn(
            async ({ where }: { where: { organizationId: string } }) => {
              const value = overrides.get(where.organizationId);
              return value === null
                ? null
                : { moduleOverrides: { publishing: value } };
            },
          ),
        },
      } as never,
      { isSubscriptionGatedFresh: vi.fn().mockResolvedValue(true) } as never,
    );
    const auth = {
      canActivate(context: ExecutionContext) {
        const req = context.switchToHttp().getRequest<RequestWithContext>();
        req.user = {
          id: 'user-1',
          userId: 'user-1',
          organizationId: 'org-1',
          brandId: 'brand-1',
          scopes: [ApiKeyScope.POSTS_DRAFT],
          ...actorFlags,
        } as never;
        req.context = {
          organizationId: 'org-1',
          isSuperAdmin: actorFlags.isSuperAdmin === true,
        } as never;
        return true;
      },
    };
    const fixture = await Test.createTestingModule({
      controllers: [RssSourcesController],
      providers: [
        { provide: RssSourcesService, useValue: service },
        { provide: RssSourceWorkflowService, useValue: { enqueueSource } },
        { provide: OrganizationModuleAccessService, useValue: access },
        { provide: APP_GUARD, useValue: auth },
        { provide: APP_GUARD, useClass: OrganizationModuleGuard },
      ],
    }).compile();
    app = fixture.createNestApplication();
    await app.init();
  });
  afterEach(async () => {
    await app?.close();
  });

  function expectNoNewWork(): void {
    expect(service.createScoped).not.toHaveBeenCalled();
    expect(service.updateScoped).not.toHaveBeenCalled();
    expect(service.removeScoped).not.toHaveBeenCalled();
    expect(enqueueSource).not.toHaveBeenCalled();
  }

  it.each([{}, { isApiKey: true }, { isSuperAdmin: true }])(
    'blocks every mutation and poll for disabled Publishing: %j',
    async (flags) => {
      actorFlags = flags;
      const calls = [
        () =>
          request(app.getHttpServer())
            .post('/rss-sources')
            .send({ label: 'feed', moduleOverrides: { publishing: true } }),
        () =>
          request(app.getHttpServer())
            .patch('/rss-sources/rss-1')
            .send({ label: 'updated' }),
        () => request(app.getHttpServer()).delete('/rss-sources/rss-1'),
        () => request(app.getHttpServer()).post('/rss-sources/rss-1/poll'),
      ];
      for (const call of calls) {
        const response = await call();
        expect(response.status).toBe(403);
        expect(response.body.code).toBe('ORGANIZATION_MODULE_DISABLED');
      }
      expectNoNewWork();
    },
  );

  it.each([false, null])(
    'checks a privileged target org even when the actor org is enabled: %j',
    async (target) => {
      actorFlags = { isSuperAdmin: true };
      overrides.set('org-1', true);
      overrides.set('org-2', target);
      for (const call of [
        () =>
          request(app.getHttpServer())
            .patch('/rss-sources/rss-1?organizationId=org-2')
            .send({ label: 'updated' }),
        () =>
          request(app.getHttpServer()).delete(
            '/rss-sources/rss-1?organizationId=org-2',
          ),
        () =>
          request(app.getHttpServer()).post(
            '/rss-sources/rss-1/poll?organizationId=org-2',
          ),
      ]) {
        const response = await call();
        expect(response.status).toBe(target === null ? 503 : 403);
        expect(response.body.code).toBe(
          target === null
            ? 'ORGANIZATION_MODULE_UNAVAILABLE'
            : 'ORGANIZATION_MODULE_DISABLED',
        );
      }
      expectNoNewWork();
      expect(service.findOneScoped).not.toHaveBeenCalled();
    },
  );

  it('keeps saved-source reads available while Publishing is disabled', async () => {
    expect(
      (await request(app.getHttpServer()).get('/rss-sources')).status,
    ).toBe(200);
    expect(
      (await request(app.getHttpServer()).get('/rss-sources/rss-1')).status,
    ).toBe(200);
    expect(service.findOneScoped).toHaveBeenCalledWith(
      'rss-1',
      expect.objectContaining({ organizationId: 'org-1' }),
    );
    expectNoNewWork();
  });

  it('rejects a normal actor target-org override before persistence', async () => {
    overrides.set('org-1', true);
    overrides.set('org-2', true);
    expect(
      (
        await request(app.getHttpServer())
          .patch('/rss-sources/rss-1?organizationId=org-2')
          .send({ label: 'updated' })
      ).status,
    ).toBe(403);
    expectNoNewWork();
  });

  it('uses the enabled target grant without subscription and rechecks after revocation', async () => {
    actorFlags = { isSuperAdmin: true };
    overrides.set('org-1', true);
    overrides.set('org-2', true);
    const url = '/rss-sources/rss-1/poll?organizationId=org-2';
    expect((await request(app.getHttpServer()).post(url)).status).toBe(201);
    expect(enqueueSource).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'rss-1',
        organizationId: 'org-2',
        userId: 'user-1',
      }),
    );
    overrides.set('org-2', false);
    expect((await request(app.getHttpServer()).post(url)).status).toBe(403);
    expect(enqueueSource).toHaveBeenCalledTimes(1);
    expect(service.findOneScoped).toHaveBeenCalledTimes(1);
  });
});
