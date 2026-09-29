import { FeaturedWorkflowsService } from '@api/collections/workflows/services/featured-workflows.service';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { FeaturedWorkflowsController } from '@api/endpoints/admin/featured-workflows/featured-workflows.controller';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import {
  type ExecutionContext,
  ForbiddenException,
  type INestApplication,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, type TestingModule } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function contextFor(requestContext: { isSuperAdmin?: boolean } | undefined) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ context: requestContext }),
    }),
  } as unknown as ExecutionContext;
}

describe('FeaturedWorkflowsController (#5511)', () => {
  const pins = [
    {
      description: null,
      featuredRank: 1,
      id: 'wf-a',
      label: 'A',
      thumbnail: null,
    },
  ];
  const featuredWorkflowsService = {
    listPinned: vi.fn(),
    pin: vi.fn(),
    reorder: vi.fn(),
    unpin: vi.fn(),
  };
  let controller: FeaturedWorkflowsController;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeaturedWorkflowsController],
      providers: [
        {
          provide: FeaturedWorkflowsService,
          useValue: featuredWorkflowsService,
        },
      ],
    })
      .overrideGuard(IpWhitelistGuard)
      .useValue({ canActivate: vi.fn().mockReturnValue(true) })
      .overrideGuard(SuperAdminGuard)
      .useValue({ canActivate: vi.fn().mockReturnValue(true) })
      .compile();

    controller = module.get(FeaturedWorkflowsController);
  });

  it('requires the IP allowlist and platform superadmin on every route', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, FeaturedWorkflowsController),
    ).toEqual([IpWhitelistGuard, SuperAdminGuard]);
  });

  it.each([
    ['an organization admin', { isSuperAdmin: false }],
    ['a request without context', undefined],
  ])('answers 403 to %s', (_, requestContext) => {
    expect(() =>
      new SuperAdminGuard().canActivate(contextFor(requestContext)),
    ).toThrow(ForbiddenException);
  });

  it('lets a platform superadmin through', () => {
    expect(
      new SuperAdminGuard().canActivate(contextFor({ isSuperAdmin: true })),
    ).toBe(true);
  });

  it('lists the pins', async () => {
    featuredWorkflowsService.listPinned.mockResolvedValue(pins);

    await expect(controller.list()).resolves.toEqual({ data: pins });
  });

  it('pins, unpins and reorders through the service', async () => {
    featuredWorkflowsService.pin.mockResolvedValue(pins);
    featuredWorkflowsService.unpin.mockResolvedValue([]);
    featuredWorkflowsService.reorder.mockResolvedValue(pins);

    await expect(controller.pin('wf-a')).resolves.toEqual({ data: pins });
    await expect(controller.unpin('wf-a')).resolves.toEqual({ data: [] });
    await expect(
      controller.reorder({ workflowIds: ['wf-a'] }),
    ).resolves.toEqual({ data: pins });

    expect(featuredWorkflowsService.pin).toHaveBeenCalledWith('wf-a');
    expect(featuredWorkflowsService.unpin).toHaveBeenCalledWith('wf-a');
    expect(featuredWorkflowsService.reorder).toHaveBeenCalledWith(['wf-a']);
  });
});

describe('FeaturedWorkflowsController over HTTP (#5511)', () => {
  const featuredWorkflowsService = {
    listPinned: vi.fn().mockResolvedValue([]),
    pin: vi.fn().mockResolvedValue([]),
    reorder: vi.fn().mockResolvedValue([]),
    unpin: vi.fn().mockResolvedValue([]),
  };
  let app: INestApplication;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [FeaturedWorkflowsController],
      providers: [
        {
          provide: FeaturedWorkflowsService,
          useValue: featuredWorkflowsService,
        },
      ],
    })
      // The allowlist is exercised by its own spec; the real superadmin
      // guard runs here.
      .overrideGuard(IpWhitelistGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    // Stands in for the request-context middleware: only the superadmin
    // flag matters to the guard under test.
    app.use((req: Request, _res: Response, next: NextFunction) => {
      Reflect.set(req, 'context', {
        isSuperAdmin: req.header('x-test-superadmin') === '1',
      });
      next();
    });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each([
    ['put', '/admin/featured-workflows/wf-a'],
    ['delete', '/admin/featured-workflows/wf-a'],
    ['put', '/admin/featured-workflows/order'],
    ['get', '/admin/featured-workflows'],
  ] as const)('answers 403 to a non-superadmin %s %s', async (method, path) => {
    await request(app.getHttpServer())[method](path).expect(403);

    expect(featuredWorkflowsService.pin).not.toHaveBeenCalled();
    expect(featuredWorkflowsService.unpin).not.toHaveBeenCalled();
    expect(featuredWorkflowsService.reorder).not.toHaveBeenCalled();
    expect(featuredWorkflowsService.listPinned).not.toHaveBeenCalled();
  });

  it('pins for a superadmin', async () => {
    await request(app.getHttpServer())
      .put('/admin/featured-workflows/wf-a')
      .set('x-test-superadmin', '1')
      .expect(200);

    expect(featuredWorkflowsService.pin).toHaveBeenCalledWith('wf-a');
  });
});
