import {
  ADD_CAMPAIGN_TARGETS_MAX_ITEMS,
  AddCampaignTargetsDto,
} from '@api/collections/outreach-campaigns/dto/add-campaign-targets.dto';
import { CampaignTargetType } from '@genfeedai/contracts';
import { validate } from 'class-validator';

function buildUrls(count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `https://x.com/genfeedai/status/${index}`,
  );
}

function buildUsernames(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `creator_${index}`);
}

describe('AddCampaignTargetsDto', () => {
  it('should be defined', () => {
    expect(AddCampaignTargetsDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new AddCampaignTargetsDto();
      expect(dto).toBeInstanceOf(AddCampaignTargetsDto);
    });

    it('accepts a url list at the maximum size', async () => {
      const dto = Object.assign(new AddCampaignTargetsDto(), {
        urls: buildUrls(ADD_CAMPAIGN_TARGETS_MAX_ITEMS),
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('rejects a url list over the maximum size', async () => {
      const dto = Object.assign(new AddCampaignTargetsDto(), {
        urls: buildUrls(ADD_CAMPAIGN_TARGETS_MAX_ITEMS + 1),
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('urls');
      expect(errors[0]?.constraints).toHaveProperty('arrayMaxSize');
    });

    it('accepts a username list at the maximum size', async () => {
      const dto = Object.assign(new AddCampaignTargetsDto(), {
        targetType: CampaignTargetType.DM_RECIPIENT,
        usernames: buildUsernames(ADD_CAMPAIGN_TARGETS_MAX_ITEMS),
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('rejects a username list over the maximum size', async () => {
      const dto = Object.assign(new AddCampaignTargetsDto(), {
        targetType: CampaignTargetType.DM_RECIPIENT,
        usernames: buildUsernames(ADD_CAMPAIGN_TARGETS_MAX_ITEMS + 1),
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('usernames');
      expect(errors[0]?.constraints).toHaveProperty('arrayMaxSize');
    });
  });
});
