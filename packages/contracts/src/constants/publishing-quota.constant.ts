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
 * - `trial`: never paid. 1 post a day per account, locked.
 * - `credits`: bought credits, no plan. The cap is editable up to a low ceiling.
 * - `plan`: on a paid plan. The cap is editable up to a higher ceiling.
 * - `unmetered`: no organization billing (self-hosted). The owner's cap stands.
 */
export type PublishingQuotaTier = 'trial' | 'credits' | 'plan' | 'unmetered';

/** Posts a day, per connected account, for an organization that never paid. */
export const PUBLISHING_QUOTA_TRIAL_LIMIT = 1;

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
  if (tier === 'trial') return PUBLISHING_QUOTA_TRIAL_LIMIT;
  if (tier === 'unmetered') return PUBLISHING_QUOTA_MAX;
  return PUBLISHING_QUOTA_CEILINGS[tier][key];
}

/**
 * The daily limit that is enforced for one account: the owner's cap held to
 * the tier's ceiling. A never-paid organization is always at the trial limit,
 * and a paid one cannot be unmetered (a cap of 0 or below means the ceiling).
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
