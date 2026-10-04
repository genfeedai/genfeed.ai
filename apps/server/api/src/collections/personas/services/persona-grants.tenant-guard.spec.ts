import { PersonaGrantsService } from '@api/collections/personas/services/persona-grants.service';
import { PersonaAvailabilityMode } from '@genfeedai/contracts';
import {
  getTenantContext,
  runWithTenantContext,
} from '@libs/prisma/tenant-context';
import {
  assertTenantScopedQuery,
  TenantIsolationError,
} from '@libs/prisma/tenant-guard';
import { ForbiddenException } from '@nestjs/common';

/**
 * CLOUD-mode tenant guard over persona grants (#6037): the actor's request
 * tenant is the OWNER organization, while the recipient organization is never
 * the tenant. Mocked delegates run the real guard on every query.
 */
const OWNER = 'org-owner';
const RECIPIENT = 'org-recipient';
const TENANT_MODELS = new Set(['Brand', 'Member', 'Persona']);

function guard(model: string, operation: string, args: unknown) {
  assertTenantScopedQuery({
    args,
    isCloud: true,
    model,
    operation,
    tenantModelNames: TENANT_MODELS,
  });
}

function setup(isRecipientAdmin = true) {
  const persona = {
    availabilityMode: PersonaAvailabilityMode.OWNING_BRAND,
    availableBrandIds: [] as string[],
    brandId: 'brand-a',
    handle: 'anna',
    id: 'persona-1',
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    brand: {
      findFirst: vi.fn(async (args: unknown) => {
        guard('Brand', 'findFirst', args);
        return { id: 'brand-a' };
      }),
    },
    persona: {
      findFirst: vi.fn(async (args: unknown) => {
        guard('Persona', 'findFirst', args);
        return persona;
      }),
    },
    personaGrant: {
      create: vi.fn().mockResolvedValue({ id: 'grant-1' }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    personaGrantAudit: { create: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) =>
      work(tx),
    ),
    brand: {
      findMany: vi.fn(async (args: unknown) => {
        guard('Brand', 'findMany', args);
        return [{ id: 'recipient-brand', organizationId: RECIPIENT }];
      }),
    },
    member: {
      findMany: vi.fn(async (args: unknown) => {
        guard('Member', 'findMany', args);
        return [
          {
            organization: { id: RECIPIENT, label: 'Recipient' },
            organizationId: RECIPIENT,
            role: { key: 'admin' },
          },
        ];
      }),
    },
    organization: {
      findFirst: vi.fn().mockResolvedValue({ id: RECIPIENT }),
    },
    persona: {
      findFirst: vi.fn(async (args: unknown) => {
        guard('Persona', 'findFirst', args);
        return persona;
      }),
    },
  };
  const tenantSeenByHandleCheck: Array<string | undefined> = [];
  const personas = {
    assertNoHandleCollision: vi.fn(async () => {
      tenantSeenByHandleCheck.push(getTenantContext()?.organizationId);
    }),
    isOrganizationOwnerOrAdmin: vi.fn(
      async (params: { organizationId: string }) => {
        const where = { isActive: true, organizationId: params.organizationId };
        guard('Member', 'findFirst', { where });
        return params.organizationId === OWNER || isRecipientAdmin;
      },
    ),
  };
  const service = new PersonaGrantsService(prisma as never, personas as never);
  return { personas, prisma, service, tenantSeenByHandleCheck, tx };
}

const base = {
  actorUserId: 'actor-1',
  brandId: 'brand-a',
  brandIds: ['recipient-brand'],
  mode: PersonaAvailabilityMode.SELECTED_BRANDS as
    | PersonaAvailabilityMode.ALL_BRANDS
    | PersonaAvailabilityMode.SELECTED_BRANDS,
  organizationId: OWNER,
  personaId: 'persona-1',
  recipientOrganizationId: RECIPIENT,
};

describe('PersonaGrantsService tenant guard (CLOUD)', () => {
  it('proves the harness: reading the recipient brands under the owner tenant throws', () => {
    expect(() =>
      runWithTenantContext({ organizationId: OWNER }, () =>
        guard('Brand', 'findMany', {
          where: { isDeleted: false, organizationId: RECIPIENT },
        }),
      ),
    ).toThrow(TenantIsolationError);
  });

  it('lists the grantable organizations of an owner/admin across tenants', async () => {
    const { service } = setup();

    const result = await runWithTenantContext({ organizationId: OWNER }, () =>
      service.listGrantableOrganizations({
        organizationId: OWNER,
        userId: 'actor-1',
      }),
    );

    expect(result).toEqual([
      {
        brands: [{ id: 'recipient-brand', label: undefined }],
        id: RECIPIENT,
        label: 'Recipient',
      },
    ]);
  });

  it('grants into a recipient organization the actor administers, checking handles in that tenant', async () => {
    const { service, tenantSeenByHandleCheck, tx } = setup();

    await expect(
      runWithTenantContext({ organizationId: OWNER }, () =>
        service.grant(base),
      ),
    ).resolves.toEqual({ id: 'grant-1' });

    expect(tenantSeenByHandleCheck).toEqual([RECIPIENT]);
    expect(tx.personaGrant.create).toHaveBeenCalledTimes(1);
  });

  it('still refuses a normal member who does not administer the recipient organization', async () => {
    const { service, tx } = setup(false);

    await expect(
      runWithTenantContext({ organizationId: OWNER }, () =>
        service.grant(base),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(tx.personaGrant.create).not.toHaveBeenCalled();
  });
});
