import { PublishingSetupController } from '@api/collections/publishing-setup/controllers/publishing-setup.controller';
import type { PublishingSetupService } from '@api/collections/publishing-setup/services/publishing-setup.service';
import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { ApiKeyScope } from '@genfeedai/enums';

describe('PublishingSetupController', () => {
  it('separates the schedule-scoped checklist from the admin-scoped support bundle', () => {
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        PublishingSetupController.prototype.getChecklist,
      ),
    ).toEqual([ApiKeyScope.POSTS_SCHEDULE]);

    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        PublishingSetupController.prototype.getDiagnostics,
      ),
    ).toEqual([ApiKeyScope.ADMIN]);
  });

  it('returns the computed checklist and diagnostics contracts untouched', async () => {
    const checklist = { checks: [], generatedAt: 'now', state: 'unknown' };
    const diagnosticsExport = {
      checklist,
      deployment: 'self-hosted',
      diagnostics: [],
      generatedAt: 'now',
    };
    const service = {
      buildChecklist: vi.fn().mockResolvedValue(checklist),
      exportDiagnostics: vi.fn().mockResolvedValue(diagnosticsExport),
    };
    const controller = new PublishingSetupController(
      service as unknown as PublishingSetupService,
    );

    await expect(controller.getChecklist()).resolves.toBe(checklist);
    await expect(controller.getDiagnostics()).resolves.toBe(diagnosticsExport);
  });
});
