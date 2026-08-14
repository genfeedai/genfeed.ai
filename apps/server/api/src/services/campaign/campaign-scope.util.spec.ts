import { resolveCampaignScope } from '@api/services/campaign/campaign-scope.util';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

describe('resolveCampaignScope', () => {
  it('reads scalar foreign keys and requires organizationId', () => {
    expect(
      resolveCampaignScope({
        brandId: 'brand_1',
        credentialId: 'cred_1',
        id: 'camp_1',
        organizationId: 'org_1',
        userId: 'user_1',
      } as never),
    ).toEqual({
      brandId: 'brand_1',
      credentialId: 'cred_1',
      organizationId: 'org_1',
      userId: 'user_1',
    });
  });

  it('throws when organizationId is missing', () => {
    expect(() =>
      resolveCampaignScope({
        id: 'camp_1',
        organizationId: null,
      } as never),
    ).toThrow(BadRequestException);
  });
});
