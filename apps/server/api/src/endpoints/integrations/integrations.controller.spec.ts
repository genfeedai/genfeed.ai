import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { OrganizationsIntegrationsController } from '@api/collections/organizations/controllers/organizations-integrations.controller';
import type { CreateIntegrationDto } from '@api/endpoints/integrations/dto/create-integration.dto';
import type { UpdateIntegrationDto } from '@api/endpoints/integrations/dto/update-integration.dto';
import type { IntegrationsService } from '@api/endpoints/integrations/integrations.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { IntegrationPlatform } from '@genfeedai/contracts';
import type { Request } from 'express';

type IntegrationRow = Record<string, unknown> & {
  id: string;
  organizationId: string;
};

/** In-memory integrations, scoped by organization like the real service. */
function createFakeIntegrationsService() {
  const rows: IntegrationRow[] = [
    {
      id: 'int-1',
      organizationId: 'org1',
      platform: IntegrationPlatform.DISCORD,
      status: 'active',
    },
    {
      id: 'int-foreign',
      organizationId: 'org2',
      platform: IntegrationPlatform.SLACK,
      status: 'active',
    },
  ];
  const find = (organizationId: string, id: string) => {
    const row = rows.find(
      (item) => item.id === id && item.organizationId === organizationId,
    );
    if (!row) throw new NotFoundException('Integration');
    return row;
  };
  const service = {
    create: async (
      organizationId: string,
      dto: CreateIntegrationDto,
      actorUserId?: string,
    ) => {
      if (
        rows.some(
          (row) =>
            row.platform === dto.platform &&
            row.organizationId === organizationId,
        )
      ) {
        throw new Error('Duplicate');
      }
      const row: IntegrationRow = {
        ...dto,
        actorUserId,
        id: `int-${rows.length + 1}`,
        organizationId,
        status: 'active',
      };
      rows.push(row);
      return row;
    },
    findAll: async (organizationId: string) =>
      rows.filter((row) => row.organizationId === organizationId),
    findOne: async (organizationId: string, id: string) =>
      find(organizationId, id),
    remove: async (organizationId: string, id: string) => {
      const row = find(organizationId, id);
      rows.splice(rows.indexOf(row), 1);
    },
    update: async (
      organizationId: string,
      id: string,
      dto: UpdateIntegrationDto,
      actorUserId?: string,
    ) => Object.assign(find(organizationId, id), dto, { actorUserId }),
  };
  return { rows, service };
}

const user = { id: 'user-1', organizationId: 'org1', userId: 'user-1' } as User;
const request = (path: string) =>
  ({ originalUrl: `/organizations/org1/integrations${path}` }) as Request;

describe('OrganizationsIntegrationsController', () => {
  let controller: OrganizationsIntegrationsController;
  let rows: IntegrationRow[];

  beforeEach(() => {
    const fake = createFakeIntegrationsService();
    rows = fake.rows;
    controller = new OrganizationsIntegrationsController(
      fake.service as unknown as IntegrationsService,
    );
  });

  it('lists only the organization’s integrations', async () => {
    const result = await controller.findAll(request(''), user, 'org1');

    expect(result).toMatchObject({
      data: [
        { attributes: { platform: IntegrationPlatform.DISCORD }, id: 'int-1' },
      ],
    });
  });

  it('returns one integration of the organization', async () => {
    const result = await controller.findOne(
      request('/int-1'),
      user,
      'org1',
      'int-1',
    );

    expect(result).toMatchObject({
      data: {
        attributes: { platform: IntegrationPlatform.DISCORD },
        id: 'int-1',
      },
    });
  });

  it('cannot read another organization’s integration through its own path', async () => {
    await expect(
      controller.findOne(request('/int-foreign'), user, 'org1', 'int-foreign'),
    ).rejects.toThrow('Integration not found');
  });

  it('creates an integration in the organization', async () => {
    const result = await controller.create(request(''), user, 'org1', {
      botToken: 'token',
      platform: IntegrationPlatform.TELEGRAM,
    } as CreateIntegrationDto);

    expect(result).toMatchObject({
      data: {
        attributes: { platform: IntegrationPlatform.TELEGRAM },
        id: 'int-3',
      },
    });
    expect(rows).toContainEqual(
      expect.objectContaining({
        organizationId: 'org1',
        platform: IntegrationPlatform.TELEGRAM,
      }),
    );
  });

  it('records who changed agent report bindings, and nobody otherwise', async () => {
    await controller.update(request('/int-1'), user, 'org1', 'int-1', {
      config: { channel: 'general' },
    } as UpdateIntegrationDto);
    expect(rows[0]).toMatchObject({
      actorUserId: undefined,
      config: { channel: 'general' },
    });

    await controller.update(request('/int-1'), user, 'org1', 'int-1', {
      config: { agentReportBindings: [] },
    } as unknown as UpdateIntegrationDto);
    expect(rows[0]).toMatchObject({ actorUserId: 'user-1' });
  });

  it('removes the integration', async () => {
    await controller.remove(user, 'org1', 'int-1');

    expect(rows.map((row) => row.id)).toEqual(['int-foreign']);
  });

  it.each([
    ['findAll', async () => controller.findAll(request(''), user, 'org2')],
    ['remove', async () => controller.remove(user, 'org2', 'int-foreign')],
  ])(
    'rejects %s for an organization the user is not in',
    async (_name, call) => {
      await expect(call()).rejects.toThrow('organization mismatch');
      expect(rows).toHaveLength(2);
    },
  );

  it('propagates errors from create', async () => {
    await expect(
      controller.create(request(''), user, 'org1', {
        botToken: 'x',
        platform: IntegrationPlatform.DISCORD,
      } as CreateIntegrationDto),
    ).rejects.toThrow('Duplicate');
  });
});
