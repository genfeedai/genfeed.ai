import { APP_ROUTES } from './routes.constant';

export const PUBLISHING_CAMPAIGN_SECTIONS = [
  'overview',
  'content',
  'calendar',
  'performance',
  'edit',
] as const;

export type PublishingCampaignSection =
  (typeof PUBLISHING_CAMPAIGN_SECTIONS)[number];

export function createPublishingCampaignRoute(
  campaignId: string,
  section: PublishingCampaignSection = 'overview',
): string {
  const base = `${APP_ROUTES.PUBLISHING.CAMPAIGNS}/${campaignId}`;
  return section === 'overview' ? base : `${base}/${section}`;
}
