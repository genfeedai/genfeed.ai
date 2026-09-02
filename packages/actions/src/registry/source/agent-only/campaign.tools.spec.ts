import {
  listExecutableOutreachCampaignTypes,
  listExecutableOutreachPlatforms,
} from '@api-types/contracts/outreach-capabilities.contract';
import { describe, expect, it } from 'vitest';
import { AGENT_CAMPAIGN_TOOLS } from './campaign.tools';

const createCampaign = AGENT_CAMPAIGN_TOOLS.find(
  (tool) => tool.name === 'create_outreach_sequence',
);

describe('AGENT_CAMPAIGN_TOOLS', () => {
  it('aligns create_outreach_sequence on credentialId and executable pairs', () => {
    expect(createCampaign?.parameters.required).toEqual([
      'label',
      'credentialId',
      'platform',
      'campaignType',
    ]);
    expect(
      [
        ...readStringEnum(createCampaign?.parameters.properties.campaignType),
      ].sort(),
    ).toEqual([...listExecutableOutreachCampaignTypes()].sort());
    expect(
      [
        ...readStringEnum(createCampaign?.parameters.properties.platform),
      ].sort(),
    ).toEqual([...listExecutableOutreachPlatforms()].sort());
    expect(createCampaign?.parameters.properties.credentialId).toEqual(
      expect.objectContaining({ type: 'string' }),
    );
    expect(createCampaign?.parameters.properties).not.toHaveProperty(
      'credential',
    );
  });

  it('does not advertise Reddit or Instagram as executable', () => {
    const platformEnum = readStringEnum(
      createCampaign?.parameters.properties.platform,
    );
    const typeEnum = readStringEnum(
      createCampaign?.parameters.properties.campaignType,
    );

    expect(platformEnum).toEqual(['twitter']);
    expect(typeEnum).toContain('scheduled');
    expect(platformEnum).not.toContain('reddit');
    expect(platformEnum).not.toContain('instagram');
  });
});

function readStringEnum(value: unknown): string[] {
  if (
    !value ||
    typeof value !== 'object' ||
    !('enum' in value) ||
    !Array.isArray(value.enum)
  ) {
    return [];
  }

  return value.enum.filter(
    (entry): entry is string => typeof entry === 'string',
  );
}
