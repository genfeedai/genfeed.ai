import { VoicesController } from '@api/collections/voices/controllers/voices.controller';
import type { ExternalVoiceCatalogService } from '@api/collections/voices/services/external-voice-catalog.service';
import { VoiceLibraryService } from '@api/collections/voices/services/voice-library.service';
import type { VoicesService } from '@api/collections/voices/services/voices.service';
import {
  adminUser,
  emptyPage,
  memberUser,
  sessionOrganizationId,
  targetOrganizationId,
  tenantReadRequest,
} from '@api-test/helpers/tenant-read.fixture';
import { TenantIsolationError } from '@libs/prisma/tenant-guard';
import { ForbiddenException } from '@nestjs/common';

describe('Voice library tenant reads (#6176)', () => {
  function setup() {
    const mock = vi
      .fn()
      .mockResolvedValue({ ...emptyPage(), docs: [{ id: 'voice-1' }] });
    const library = new VoiceLibraryService(
      { findAll: mock } as unknown as VoicesService,
      {
        findAll: vi.fn().mockResolvedValue([]),
      } as unknown as ExternalVoiceCatalogService,
    );
    const controller = Object.create(
      VoicesController.prototype,
    ) as VoicesController;
    Object.assign(controller, { voiceLibraryService: library });
    return { controller, mock };
  }

  describe.each(['library', 'cloned'] as const)('%s', (route) => {
    function read(controller: VoicesController, user = memberUser, query = {}) {
      const request = tenantReadRequest(user, query);
      return route === 'library'
        ? controller.findAll(query, request, user)
        : controller.findClonedVoices(request, user, query);
    }

    it('reads the target tenant for a verified superadmin', async () => {
      const { controller, mock } = setup();
      await read(controller, adminUser, {
        organizationId: targetOrganizationId,
      });
      expect(mock.mock.calls[0]?.[0].where).toMatchObject({
        organizationId: targetOrganizationId,
        isDeleted: false,
      });
    });

    it('rejects a member foreign organization', async () => {
      const { controller, mock } = setup();
      await expect(
        read(controller, memberUser, { organizationId: targetOrganizationId }),
      ).rejects.toThrow(ForbiddenException);
      expect(mock).not.toHaveBeenCalled();
    });

    it('keeps the member session scope', async () => {
      const { controller, mock } = setup();
      await read(controller);
      expect(mock.mock.calls[0]?.[0].where).toMatchObject({
        organizationId: sessionOrganizationId,
        isDeleted: false,
      });
    });

    it('rethrows TenantIsolationError without masking its reason', async () => {
      const { controller, mock } = setup();
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
