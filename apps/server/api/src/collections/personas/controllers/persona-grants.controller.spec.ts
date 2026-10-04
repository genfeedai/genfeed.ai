import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PersonaGrantsController } from '@api/collections/personas/controllers/persona-grants.controller';
import { PersonaGrantsService } from '@api/collections/personas/services/persona-grants.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { PersonaAvailabilityMode } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { Test } from '@nestjs/testing';

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
});
