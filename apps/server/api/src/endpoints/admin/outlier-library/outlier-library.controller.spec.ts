import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { AdminOutlierLibraryController } from '@api/endpoints/admin/outlier-library/outlier-library.controller';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';

describe('outlier library removal route', () => {
  it('requires both the IP allow-list and the platform super-admin guards', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminOutlierLibraryController),
    ).toEqual([IpWhitelistGuard, SuperAdminGuard]);
  });

  it('removes the named creator and rejects a body that names anything else', async () => {
    const removed: unknown[] = [];
    const controller = new AdminOutlierLibraryController({
      removeCreator: async (input: unknown) => {
        removed.push(input);
      },
    } as never);

    await controller.remove({ handle: ' @someone ', platform: 'tiktok' });
    for (const body of [
      {},
      { handle: 'someone', platform: 'linkedin' },
      { handle: '', platform: 'tiktok' },
      { handle: 'someone', platform: 'tiktok', reason: 'kept?' },
    ]) {
      await expect(controller.remove(body)).rejects.toThrow();
    }

    expect(removed).toEqual([{ handle: '@someone', platform: 'tiktok' }]);
  });
});
