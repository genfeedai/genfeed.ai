import { describe, expect, it } from 'vitest';
import { createPublishingCampaignRoute } from './publishing-campaigns-routes.constant';
import { APP_ROUTES } from './routes.constant';

describe('createPublishingCampaignRoute', () => {
  it('keeps overview on the campaign identity path', () => {
    expect(createPublishingCampaignRoute('cmp_spring')).toBe(
      `${APP_ROUTES.PUBLISHING.CAMPAIGNS}/cmp_spring`,
    );
  });

  it('nests content, calendar, performance, and edit under the campaign', () => {
    expect(createPublishingCampaignRoute('cmp_spring', 'content')).toBe(
      `${APP_ROUTES.PUBLISHING.CAMPAIGNS}/cmp_spring/content`,
    );
    expect(createPublishingCampaignRoute('cmp_spring', 'calendar')).toBe(
      `${APP_ROUTES.PUBLISHING.CAMPAIGNS}/cmp_spring/calendar`,
    );
    expect(createPublishingCampaignRoute('cmp_spring', 'performance')).toBe(
      `${APP_ROUTES.PUBLISHING.CAMPAIGNS}/cmp_spring/performance`,
    );
    expect(createPublishingCampaignRoute('cmp_spring', 'edit')).toBe(
      `${APP_ROUTES.PUBLISHING.CAMPAIGNS}/cmp_spring/edit`,
    );
  });
});
