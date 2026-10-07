import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PersonaGrantsController } from '@api/collections/personas/controllers/persona-grants.controller';
import { PersonaGrantsService } from '@api/collections/personas/services/persona-grants.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantContextInterceptor } from '@api/helpers/interceptors/tenant-context/tenant-context.interceptor';
import { PersonaAvailabilityMode } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { getTenantContext } from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { defer, firstValueFrom } from 'rxjs';

const organizationId = testId('org');
const brandId = testId('brand');
const otherBrandId = testId('brand', 2);
const userId = testId('user');
const personaId = testId('persona');
const user = {
  brandId,
  id: userId,
  organizationId,
  userId,
} as unknown as User;

describe('PersonaGrantsController (#6037)', () => {
  let controller: PersonaGrantsController;
  const grants = {
    grant: vi.fn(),
    listForPersona: vi.fn(),
    listGrantableOrganizations: vi.fn(),
    revoke: vi.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [PersonaGrantsController],
      providers: [{ provide: PersonaGrantsService, useValue: grants }],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(PersonaGrantsController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('grants as the acting user in their own organization and brand', async () => {
    grants.grant.mockResolvedValue({ id: 'grant-1' });

    await expect(
      controller.grant(user, personaId, {
        brandIds: [otherBrandId],
        mode: PersonaAvailabilityMode.SELECTED_BRANDS,
        recipientOrganizationId: 'org-2',
      }),
    ).resolves.toEqual({ data: { id: 'grant-1' } });

    expect(grants.grant).toHaveBeenCalledWith({
      actorUserId: userId,
      apiKeyContext: user,
      brandId,
      brandIds: [otherBrandId],
      mode: PersonaAvailabilityMode.SELECTED_BRANDS,
      organizationId,
      personaId,
      recipientOrganizationId: 'org-2',
    });
  });

  it('lists grants, grantable organizations and revokes by grant id', async () => {
    grants.listForPersona.mockResolvedValue([{ id: 'grant-1' }]);
    grants.listGrantableOrganizations.mockResolvedValue([
      { brands: [], id: 'org-2', label: 'Show' },
    ]);

    await expect(controller.listGrants(user, personaId)).resolves.toEqual({
      grants: [{ id: 'grant-1' }],
    });
    await expect(controller.listGrantableOrganizations(user)).resolves.toEqual({
      organizations: [{ brands: [], id: 'org-2', label: 'Show' }],
    });
    await controller.revokeGrant(user, personaId, testId('grant'));

    expect(grants.revoke).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: userId,
        brandId,
        organizationId,
        personaId,
      }),
    );
  });

  it('a receiving-side edit never reaches the grant: the persona is looked up in the caller organization', async () => {
    grants.listForPersona.mockImplementation(
      async (params: { organizationId: string }) => {
        expect(params.organizationId).toBe(organizationId);
        return [];
      },
    );

    await controller.listGrants(user, personaId);

    expect(grants.listForPersona).toHaveBeenCalledOnce();
  });

  describe('owner-only organization query boundary', () => {
    const foreignOrganizationId = testId('org', 2);
    const delegate = vi.fn();
    let pinnedOrganizationId: string | undefined;

    beforeEach(() => {
      pinnedOrganizationId = undefined;
      delegate.mockReset();
      delegate.mockResolvedValue([]);
      grants.listForPersona.mockReset();
      grants.listForPersona.mockImplementation(
        async (params: {
          organizationId: string;
          brandId: string;
          personaId: string;
        }) => {
          const args = {
            where: {
              id: params.personaId,
              organizationId: params.organizationId,
              brandId: params.brandId,
              isDeleted: false,
            },
          };
          assertTenantScopedQuery({
            args,
            isCloud: true,
            model: 'Persona',
            operation: 'findFirst',
            tenantModelNames: new Set(['Persona']),
          });
          return delegate(args);
        },
      );
    });

    function listWithTenant(
      isSuperAdmin: boolean,
      organizationQuery: unknown,
      id = personaId,
    ) {
      const actor = { ...user, isSuperAdmin };
      const request = {
        context: { organizationId, isSuperAdmin },
        user: actor,
        query:
          organizationQuery === undefined
            ? {}
            : { organizationId: organizationQuery },
      };
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;
      const next: CallHandler = {
        handle: () =>
          defer(() => {
            pinnedOrganizationId = getTenantContext()?.organizationId;
            return controller.listGrants(actor, id, organizationQuery);
          }),
      };
      return firstValueFrom(
        new TenantContextInterceptor().intercept(context, next),
      );
    }

    it.each([true, false])(
      'refuses a foreign organization before a guarded owner read (superadmin=%s)',
      async (isSuperAdmin) => {
        await expect(
          listWithTenant(isSuperAdmin, foreignOrganizationId),
        ).rejects.toMatchObject({
          status: 403,
          message: 'Organization context changed',
        });
        expect(pinnedOrganizationId).toBe(
          isSuperAdmin ? foreignOrganizationId : organizationId,
        );
        expect(grants.listForPersona).not.toHaveBeenCalled();
        expect(delegate).not.toHaveBeenCalled();
      },
    );

    it.each([undefined, organizationId, ` ${organizationId} `])(
      'preserves owner context for absent or redundant query %j',
      async (query) => {
        await expect(listWithTenant(true, query)).resolves.toEqual({
          grants: [],
        });
        expect(pinnedOrganizationId).toBe(organizationId);
        expect(grants.listForPersona).toHaveBeenCalledWith({
          organizationId,
          brandId,
          personaId,
        });
        expect(delegate).toHaveBeenCalledOnce();
      },
    );

    it.each([
      '',
      '   ',
      'malformed',
      null,
      [organizationId],
      { id: organizationId },
    ])(
      'refuses invalid explicit query %j before persona validation',
      async (query) => {
        await expect(
          listWithTenant(true, query, 'invalid-persona'),
        ).rejects.toMatchObject({
          status: 403,
          message: 'Organization context changed',
        });
        expect(grants.listForPersona).not.toHaveBeenCalled();
        expect(delegate).not.toHaveBeenCalled();
      },
    );

    it('preserves no-query persona ID validation', async () => {
      await expect(
        listWithTenant(true, undefined, 'invalid-persona'),
      ).rejects.toMatchObject({ status: 400 });
      expect(grants.listForPersona).not.toHaveBeenCalled();
      expect(delegate).not.toHaveBeenCalled();
    });
  });
});
