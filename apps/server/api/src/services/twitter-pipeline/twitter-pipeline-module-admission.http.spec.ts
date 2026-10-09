import { MembersService } from '@api/collections/members/services/members.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { OrganizationModuleGuard } from '@api/common/organization-modules/organization-module.guard';
import { OrganizationModuleAccessService } from '@api/common/organization-modules/organization-module-access.service';
import { TwitterPipelineController } from '@api/services/twitter-pipeline/twitter-pipeline.controller';
import { TwitterPipelineService } from '@api/services/twitter-pipeline/twitter-pipeline.service';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  hasOrganizationBilling: () => true,
}));

const ORG = 'corgscope1';
const ROOT = `/organizations/${ORG}/twitter-pipeline`;
const SEARCH = { brandId: 'brand-1', query: 'AI' };
const DRAFT = {
  searchResults: [],
  voiceConfig: { handle: 'brand', description: 'Helpful', searchQuery: 'AI' },
};
const PUBLISH = { brandId: 'brand-1', text: 'Hello', type: 'original' };

describe('X pipeline HTTP module admission', () => {
  let app: INestApplication;
  let overrides: { discovery: boolean; publishing: boolean } | null;
  let flags: { isApiKey?: boolean; isSuperAdmin?: boolean };
  const service = { search: vi.fn(), draft: vi.fn(), publish: vi.fn() };
  const paid = { isSubscriptionGatedFresh: vi.fn() };
  const members = { findOne: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    overrides = { discovery: false, publishing: false };
    flags = {};
    service.search.mockResolvedValue([]);
    service.draft.mockResolvedValue([]);
    service.publish.mockResolvedValue({ success: true });
    paid.isSubscriptionGatedFresh.mockResolvedValue(false);
    members.findOne.mockResolvedValue({ id: 'member-1' });
    const access = new OrganizationModuleAccessService(
      {
        organization: {
          findFirst: vi.fn(async ({ where }: { where: { id: string } }) => ({
            id: where.id,
          })),
        },
        organizationSetting: {
          findUnique: vi.fn(async () =>
            overrides === null ? null : { moduleOverrides: overrides },
          ),
        },
      } as never,
      paid as never,
    );
    const auth = {
      canActivate(context: ExecutionContext) {
        const req = context.switchToHttp().getRequest<RequestWithContext>();
        req.user = {
          id: 'user-1',
          userId: 'user-1',
          organizationId: ORG,
          brandId: 'brand-1',
          apiKeyId: 'key-1',
          ...flags,
        } as never;
        req.context = {
          organizationId: ORG,
          isSuperAdmin: flags.isSuperAdmin === true,
        } as never;
        return true;
      },
    };
    const fixture = await Test.createTestingModule({
      controllers: [TwitterPipelineController],
      providers: [
        { provide: TwitterPipelineService, useValue: service },
        { provide: MembersService, useValue: members },
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

  it.each([{}, { isApiKey: true }, { isSuperAdmin: true }])(
    'blocks disabled Discovery before search/draft services: %j',
    async (actor) => {
      flags = actor;
      await request(app.getHttpServer())
        .post(`${ROOT}/search`)
        .send(SEARCH)
        .expect(403);
      await request(app.getHttpServer())
        .post(`${ROOT}/draft`)
        .send(DRAFT)
        .expect(403);
      expect(service.search).not.toHaveBeenCalled();
      expect(service.draft).not.toHaveBeenCalled();
    },
  );

  it.each([{}, { isApiKey: true }, { isSuperAdmin: true }])(
    'blocks disabled Publishing before outbound work: %j',
    async (actor) => {
      flags = actor;
      await request(app.getHttpServer())
        .post(`${ROOT}/publish`)
        .send(PUBLISH)
        .expect(403);
      expect(service.publish).not.toHaveBeenCalled();
    },
  );

  it('requires the fresh paid grant for Discovery while enabled Publishing remains credit-based', async () => {
    overrides = { discovery: true, publishing: true };
    paid.isSubscriptionGatedFresh.mockResolvedValue(true);
    await request(app.getHttpServer())
      .post(`${ROOT}/search`)
      .send(SEARCH)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${ROOT}/draft`)
      .send(DRAFT)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${ROOT}/publish`)
      .send(PUBLISH)
      .expect(200);
    expect(service.search).not.toHaveBeenCalled();
    expect(service.draft).not.toHaveBeenCalled();
    expect(service.publish).toHaveBeenCalledOnce();
    expect(paid.isSubscriptionGatedFresh).toHaveBeenCalledTimes(2);
    expect(paid.isSubscriptionGatedFresh).toHaveBeenCalledWith(ORG);
  });

  it('admits enabled Discovery then blocks a later request after revocation', async () => {
    overrides = { discovery: true, publishing: true };
    await request(app.getHttpServer())
      .post(`${ROOT}/search`)
      .send(SEARCH)
      .expect(200);
    overrides.discovery = false;
    await request(app.getHttpServer())
      .post(`${ROOT}/draft`)
      .send(DRAFT)
      .expect(403);
    expect(service.search).toHaveBeenCalledOnce();
    expect(service.draft).not.toHaveBeenCalled();
  });

  it('fails closed before any service when module settings are unavailable', async () => {
    overrides = null;
    await request(app.getHttpServer())
      .post(`${ROOT}/search`)
      .send(SEARCH)
      .expect(503);
    await request(app.getHttpServer())
      .post(`${ROOT}/draft`)
      .send(DRAFT)
      .expect(503);
    await request(app.getHttpServer())
      .post(`${ROOT}/publish`)
      .send(PUBLISH)
      .expect(503);
    expect(service.search).not.toHaveBeenCalled();
    expect(service.draft).not.toHaveBeenCalled();
    expect(service.publish).not.toHaveBeenCalled();
  });

  it.each([{}, { isApiKey: true }])(
    'retains real membership-guard rejection of cross-org paths: %j',
    async (actor) => {
      flags = actor;
      overrides = { discovery: true, publishing: true };
      await request(app.getHttpServer())
        .post('/organizations/corgscope2/twitter-pipeline/publish')
        .send(PUBLISH)
        .expect(403);
      expect(service.publish).not.toHaveBeenCalled();
    },
  );
});
