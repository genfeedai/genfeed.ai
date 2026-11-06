import { BrandsService } from '@api/collections/brands/services/brands.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsSettingsController } from '@api/collections/organizations/controllers/organizations-settings.controller';
import { AgentPolicyOverridesService } from '@api/collections/organizations/services/agent-policy-overrides.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ByokService } from '@api/services/byok/byok.service';
import { WebhookDispatchService } from '@api/services/webhook-client/webhook-client.module';
import {
  adminUser,
  lazyTenantResult,
  memberUser,
  sessionOrganizationId,
  targetBrandId,
  targetOrganizationId,
  tenantReadRequest,
} from '@api-test/helpers/tenant-read.fixture';
import { ByokProvider } from '@genfeedai/contracts';
import { SUBSCRIPTIONS_SERVICE } from '@genfeedai/contracts/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import {
  getTenantContext,
  runWithTenantContext,
} from '@libs/prisma/tenant-context';
import { ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';

describe('Organization settings authorized path reads (#6176)', () => {
  async function setup(isMissingSettings = false) {
    // Each read records its arguments when issued and the tenant scope it
    // actually ran in when awaited, like a lazy Prisma query.
    const reads: unknown[][] = [];
    const selfHeals: unknown[][] = [];
    const executedIn: ReturnType<typeof getTenantContext>[] = [];
    const capture = (context: ReturnType<typeof getTenantContext>) => {
      executedIn.push(context);
    };
    const settingsRow = isMissingSettings
      ? null
      : {
          id: 'settings',
          isFleetEnabled: true,
          organizationId: targetOrganizationId,
        };
    const read = (...args: unknown[]) => {
      reads.push(args);
      return lazyTenantResult(settingsRow, capture);
    };
    const byok = (...args: unknown[]) => {
      reads.push(args);
      return lazyTenantResult([{ provider: ByokProvider.OPENROUTER }], capture);
    };
    const ensure = (...args: unknown[]) => {
      selfHeals.push(args);
      return lazyTenantResult(settingsRow, capture);
    };
    const settingsService = { ensureForOrganization: ensure, findOne: read };
    const module = await Test.createTestingModule({
      controllers: [OrganizationsSettingsController],
      providers: [
        { provide: OrganizationSettingsService, useValue: settingsService },
        { provide: BrandsService, useValue: { findOne: read } },
        { provide: IngredientsService, useValue: {} },
        { provide: AgentPolicyOverridesService, useValue: {} },
        { provide: SUBSCRIPTIONS_SERVICE, useValue: { findOne: read } },
        { provide: ByokService, useValue: { getStatus: byok } },
        { provide: WebhookDispatchService, useValue: {} },
        { provide: AccessBootstrapCacheService, useValue: {} },
        { provide: EventEmitter2, useValue: { emitAsync: async () => [] } },
        {
          provide: LoggerService,
          useValue: {
            error: () => undefined,
            log: () => undefined,
            warn: () => undefined,
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const controller = module.get<OrganizationsSettingsController>(
      OrganizationsSettingsController,
    );
    return { controller, executedIn, reads, selfHeals };
  }

  it('reads foreign settings without creating or patching them', async () => {
    const { controller, reads, selfHeals } = await setup();
    const response = await controller.getSettings(
      tenantReadRequest(adminUser),
      targetOrganizationId,
    );
    expect(response.data?.id).toBe('settings');
    expect(reads).toEqual([
      [{ organizationId: targetOrganizationId }, [], { includePaidHint: true }],
    ]);
    expect(selfHeals).toEqual([]);
  });

  it('returns 404 for missing foreign settings without self-healing', async () => {
    const { controller, reads, selfHeals } = await setup(true);
    await expect(
      controller.getSettings(
        tenantReadRequest(adminUser),
        targetOrganizationId,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(reads).toEqual([
      [{ organizationId: targetOrganizationId }, [], { includePaidHint: true }],
    ]);
    expect(selfHeals).toEqual([]);
  });

  it.each([adminUser, memberUser])(
    'self-heals only the caller session organization',
    async (user) => {
      const { controller, selfHeals } = await setup();
      await controller.getSettings(
        tenantReadRequest(user),
        sessionOrganizationId,
      );
      expect(selfHeals).toEqual([
        [sessionOrganizationId, { includePaidHint: true }],
      ]);
    },
  );

  describe.each([
    'settings',
    'fleet',
    'subscription',
    'byok',
    'byok-provider',
  ] as const)('%s', (route) => {
    function invoke(
      controller: OrganizationsSettingsController,
      user = adminUser,
      org = targetOrganizationId,
    ) {
      const request = tenantReadRequest(user);
      switch (route) {
        case 'settings':
          return controller.getSettings(request, org);
        case 'fleet':
          return controller.getFleetCapabilities(request, org, targetBrandId);
        case 'subscription':
          return controller.findOneSubscription(request, org);
        case 'byok':
          return controller.getByokAllProviders(request, org);
        case 'byok-provider':
          return controller.getByokProviderStatus(
            request,
            org,
            ByokProvider.OPENROUTER,
          );
      }
    }
    it('awaits lazy reads inside the authorized path organization and restores the caller scope', async () => {
      const { controller, executedIn } = await setup();
      await runWithTenantContext(
        { organizationId: sessionOrganizationId },
        async () => {
          await invoke(controller);
          expect(getTenantContext()).toEqual({
            organizationId: sessionOrganizationId,
          });
        },
      );
      expect(
        new Set(executedIn.map((context) => context?.organizationId)),
      ).toEqual(new Set([targetOrganizationId]));
    });
    it('rejects a member foreign path before executing a read', async () => {
      const { controller, executedIn, reads } = await setup();
      await expect(invoke(controller, memberUser)).rejects.toThrow(
        ForbiddenException,
      );
      expect(reads).toEqual([]);
      expect(executedIn).toEqual([]);
    });
    it('keeps a member read pinned to the session path', async () => {
      const { controller, executedIn } = await setup();
      await invoke(controller, memberUser, sessionOrganizationId);
      expect(
        new Set(executedIn.map((context) => context?.organizationId)),
      ).toEqual(new Set([sessionOrganizationId]));
    });
  });
});
