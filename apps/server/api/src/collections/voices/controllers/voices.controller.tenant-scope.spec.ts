import { VoicesController } from '@api/collections/voices/controllers/voices.controller';
import { VoicesQueryDto } from '@api/collections/voices/dto/voices-query.dto';
import { ExternalVoiceCatalogService } from '@api/collections/voices/services/external-voice-catalog.service';
import { VoiceCloneService } from '@api/collections/voices/services/voice-clone.service';
import { VoiceLibraryService } from '@api/collections/voices/services/voice-library.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import {
  adminUser,
  emptyPage,
  memberUser,
  sessionOrganizationId,
  targetOrganizationId,
  tenantReadQuery,
  tenantReadRequest,
} from '@api-test/helpers/tenant-read.fixture';
import { TenantIsolationError } from '@libs/prisma/tenant-guard';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

describe('Voice library tenant reads (#6176)', () => {
  async function setup() {
    const mock = vi
      .fn()
      .mockResolvedValue({ ...emptyPage(), docs: [{ id: 'voice-1' }] });
    const module = await Test.createTestingModule({
      controllers: [VoicesController],
      providers: [
        VoiceLibraryService,
        { provide: VoicesService, useValue: { findAll: mock } },
        {
          provide: ExternalVoiceCatalogService,
          useValue: { findAll: vi.fn().mockResolvedValue([]) },
        },
        { provide: VoiceCloneService, useValue: {} },
      ],
    }).compile();
    const controller = module.get<VoicesController>(VoicesController);
    return { controller, mock };
  }

  describe.each(['library', 'cloned'] as const)('%s', (route) => {
    function read(
      controller: VoicesController,
      user = memberUser,
      overrides: Partial<VoicesQueryDto> = {},
    ) {
      const query = tenantReadQuery(VoicesQueryDto, overrides);
      const request = tenantReadRequest(user, query);
      return route === 'library'
        ? controller.findAll(query, request, user)
        : controller.findClonedVoices(request, user, query);
    }

    it('reads the target tenant for a verified superadmin', async () => {
      const { controller, mock } = await setup();
      await read(controller, adminUser, {
        organizationId: targetOrganizationId,
      });
      expect(mock.mock.calls[0]?.[0].where).toMatchObject({
        organizationId: targetOrganizationId,
        isDeleted: false,
      });
    });

    it('rejects a member foreign organization', async () => {
      const { controller, mock } = await setup();
      await expect(
        read(controller, memberUser, { organizationId: targetOrganizationId }),
      ).rejects.toThrow(ForbiddenException);
      expect(mock).not.toHaveBeenCalled();
    });

    it('keeps the member session scope', async () => {
      const { controller, mock } = await setup();
      await read(controller);
      expect(mock.mock.calls[0]?.[0].where).toMatchObject({
        organizationId: sessionOrganizationId,
        isDeleted: false,
      });
    });

    it.each(['', '  '])(
      'rejects a missing organization (%s) before reading',
      async (organizationId) => {
        const { controller, mock } = await setup();
        await expect(
          read(controller, { ...memberUser, organizationId }),
        ).rejects.toThrow(BadRequestException);
        expect(mock).not.toHaveBeenCalled();
      },
    );

    it('rethrows TenantIsolationError without masking its reason', async () => {
      const { controller, mock } = await setup();
      const error = new TenantIsolationError(
        'Ingredient',
        'findMany',
        'organization-id-mismatch',
        'Wrong organization',
      );
      mock.mockRejectedValue(error);
      await expect(read(controller)).rejects.toBe(error);
    });
  });
});
