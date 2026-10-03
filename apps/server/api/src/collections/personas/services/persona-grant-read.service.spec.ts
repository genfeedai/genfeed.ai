import { PersonaGrantReadService } from '@api/collections/personas/services/persona-grant-read.service';
import { PersonaAvailabilityMode } from '@genfeedai/contracts';

const persona = {
  avatarIngredientId: 'avatar-1',
  config: {},
  description: null,
  handle: 'anna',
  id: 'persona-1',
  label: 'Anna',
  status: 'ACTIVE',
};
const row = (overrides: Record<string, unknown> = {}) => ({
  availabilityMode: PersonaAvailabilityMode.ALL_BRANDS,
  availableBrandIds: [] as string[],
  id: 'grant-1',
  ownerOrganization: { label: 'Vincent' },
  persona,
  ...overrides,
});

function setup() {
  const prisma = {
    personaGrant: { findFirst: vi.fn(), findMany: vi.fn() },
  };
  return {
    prisma,
    service: new PersonaGrantReadService(prisma as never),
  };
}

describe('PersonaGrantReadService (#6037)', () => {
  it('keys every read on the caller organization and an active grant', async () => {
    const { prisma, service } = setup();
    prisma.personaGrant.findMany.mockResolvedValue([row()]);
    prisma.personaGrant.findFirst.mockResolvedValue(row());

    await service.findReferenceGrants({
      ingredientIds: ['avatar-1'],
      organizationId: 'org-2',
    });
    await service.findHandleGrants({
      brandId: 'brand-x',
      handles: ['anna'],
      organizationId: 'org-2',
    });
    await service.listForBrand({ brandId: 'brand-x', organizationId: 'org-2' });
    await service.findForBrand({
      brandId: 'brand-x',
      organizationId: 'org-2',
      personaId: 'persona-1',
    });

    for (const call of [
      ...prisma.personaGrant.findMany.mock.calls,
      ...prisma.personaGrant.findFirst.mock.calls,
    ]) {
      expect(call[0].where).toMatchObject({
        recipientOrganizationId: 'org-2',
        revokedAt: null,
      });
    }
  });

  it('lists only granted characters whose receiving availability includes the brand', async () => {
    const { prisma, service } = setup();
    prisma.personaGrant.findMany.mockResolvedValue([
      row({
        availabilityMode: PersonaAvailabilityMode.SELECTED_BRANDS,
        availableBrandIds: ['brand-x'],
      }),
      row({
        availabilityMode: PersonaAvailabilityMode.SELECTED_BRANDS,
        availableBrandIds: ['brand-y'],
        id: 'grant-2',
      }),
    ]);

    const visible = await service.listForBrand({
      brandId: 'brand-x',
      organizationId: 'org-2',
    });

    expect(visible.map((grant) => grant.id)).toEqual(['grant-1']);
    await expect(
      service.listForBrand({ brandId: null, organizationId: 'org-2' }),
    ).resolves.toEqual([]);
  });

  it('answers null for a character the brand cannot use, never revealing it', async () => {
    const { prisma, service } = setup();
    prisma.personaGrant.findFirst.mockResolvedValue(
      row({
        availabilityMode: PersonaAvailabilityMode.SELECTED_BRANDS,
        availableBrandIds: ['brand-y'],
      }),
    );
    await expect(
      service.findForBrand({
        brandId: 'brand-x',
        organizationId: 'org-2',
        personaId: 'persona-1',
      }),
    ).resolves.toBeNull();

    prisma.personaGrant.findFirst.mockResolvedValue(null);
    await expect(
      service.findForBrand({
        brandId: 'brand-x',
        organizationId: 'org-2',
        personaId: 'persona-1',
      }),
    ).resolves.toBeNull();
  });
});
