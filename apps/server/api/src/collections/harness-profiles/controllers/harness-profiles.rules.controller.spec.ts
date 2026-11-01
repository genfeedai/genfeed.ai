import { HarnessProfilesController } from '@api/collections/harness-profiles/controllers/harness-profiles.controller';
import type { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';

describe('HarnessProfilesController rule proposals', () => {
  const controller = new HarnessProfilesController(
    {} as unknown as HarnessProfilesService,
  );

  it('proposes rules from a rich-text edit by comparing the words, not the markup', async () => {
    await expect(
      controller.proposeRules({
        brandId: 'brand-1',
        edited: '<p>The editor is live.</p>',
        original: '<p>The editor is <strong>truly</strong> live.</p>',
      }),
    ).resolves.toEqual({ proposals: ['Never use "truly".'] });
  });

  it('proposes the rejection reason as a rule', async () => {
    await expect(
      controller.proposeRules({ brandId: 'brand-1', reason: 'Too salesy' }),
    ).resolves.toEqual({ proposals: ['Too salesy.'] });
  });
});
