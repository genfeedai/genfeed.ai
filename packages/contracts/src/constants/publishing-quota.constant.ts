/**
 * Upper bound for an organization's per-platform daily publishing cap
 * (`OrganizationSetting.quota*`) on a deployment without organization billing.
 * A cap of 0 means the platform is unmetered there.
 */
export const PUBLISHING_QUOTA_MAX = 1000;

/** The `OrganizationSetting` fields that hold a per-platform daily cap. */
export const PUBLISHING_QUOTA_KEYS = [
  'quotaTwitter',
  'quotaInstagram',
  'quotaYoutube',
  'quotaTiktok',
] as const;

export type PublishingQuotaKey = (typeof PUBLISHING_QUOTA_KEYS)[number];

/**
 * What an organization has paid, which sets how many posts a day each
 * connected account may publish:
 * - `trial`: never paid. Publishes nothing until the first payment, locked.
 * - `credits`: bought credits, no plan. The cap is editable up to a low ceiling.
 * - `plan`: on a paid plan. The cap is editable up to a higher ceiling.
 * - `unmetered`: no organization billing (self-hosted). The owner's cap stands.
 */
export type PublishingQuotaTier = 'trial' | 'credits' | 'plan' | 'unmetered';

/** How high the cap can be set for each paid tier. */
export const PUBLISHING_QUOTA_CEILINGS: Record<
  'credits' | 'plan',
  Record<PublishingQuotaKey, number>
> = {
  credits: {
    quotaInstagram: 5,
    quotaTiktok: 5,
    quotaTwitter: 5,
    quotaYoutube: 5,
  },
  plan: {
    quotaInstagram: 15,
    quotaTiktok: 10,
    quotaTwitter: 25,
    quotaYoutube: 10,
  },
};

/** The highest cap a tier allows on one platform. */
export function resolvePublishingQuotaCeiling(
  tier: PublishingQuotaTier,
  key: PublishingQuotaKey,
): number {
  // Cloud has no free tier: a never-paid organization publishes nothing.
  if (tier === 'trial') return 0;
  if (tier === 'unmetered') return PUBLISHING_QUOTA_MAX;
  return PUBLISHING_QUOTA_CEILINGS[tier][key];
}

/**
 * The daily limit that is enforced for one account: the owner's cap held to
 * the tier's ceiling. A never-paid organization is held at 0 (it publishes
 * nothing; callers must not read that 0 as unmetered), and a paid one cannot
 * be unmetered (a cap of 0 or below means the ceiling).
 * Without organization billing the owner's cap stands, and 0 stays unmetered.
 */
export function resolveEffectivePublishingQuota(
  tier: PublishingQuotaTier,
  key: PublishingQuotaKey,
  configured: number | null | undefined,
): number {
  const value =
    typeof configured === 'number' && Number.isFinite(configured)
      ? Math.floor(configured)
      : 0;
  if (tier === 'unmetered') return Math.max(value, 0);
  const ceiling = resolvePublishingQuotaCeiling(tier, key);
  if (tier === 'trial') return ceiling;
  return value > 0 ? Math.min(value, ceiling) : ceiling;
}
