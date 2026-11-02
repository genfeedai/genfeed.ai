import { HarnessProfilesController } from '@api/collections/harness-profiles/controllers/harness-profiles.controller';
import {
  ProposeBrandRulesDto,
  SaveBrandRulesDto,
} from '@api/collections/harness-profiles/dto/brand-rules.dto';
import type { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

describe('HarnessProfilesController rule proposals', () => {
  const controller = new HarnessProfilesController(
    {} as unknown as HarnessProfilesService,
  );

  it('accepts text corrections without a brand selection', () => {
    const dto = plainToInstance(ProposeBrandRulesDto, {
      edited: 'The editor is live.',
      original: 'The editor is truly live.',
    });

    expect(validateSync(dto)).toEqual([]);
  });

  it('still requires a brand when saving accepted rules', () => {
    const dto = plainToInstance(SaveBrandRulesDto, {
      rules: ['Never use "truly".'],
    });

    expect(validateSync(dto)).toEqual([
      expect.objectContaining({ property: 'brandId' }),
    ]);
  });

  it('proposes rules from a rich-text edit by comparing the words, not the markup', async () => {
    await expect(
      controller.proposeRules({
        edited: '<p>The editor is live.</p>',
        original: '<p>The editor is <strong>truly</strong> live.</p>',
      }),
    ).resolves.toEqual({ proposals: ['Never use "truly".'] });
  });

  it('proposes the rejection reason as a rule', async () => {
    await expect(
      controller.proposeRules({ reason: 'Too salesy' }),
    ).resolves.toEqual({ proposals: ['Too salesy.'] });
  });
});
