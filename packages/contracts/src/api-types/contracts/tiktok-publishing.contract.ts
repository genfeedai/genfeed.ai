import { z } from 'zod';
import { PostVisibility } from '../..';
import type { ChannelSettingDefinition } from './channel-setting-validation.contract';
import { tiktokAuthorizedSignalsSnapshotSchema } from './tiktok-authorized-signals.contract';

export const TIKTOK_PRIVACY_OPTIONS = [
  { label: 'Everyone', value: 'public', providerValue: 'PUBLIC_TO_EVERYONE' },
  {
    label: 'Followers',
    value: 'followers',
    providerValue: 'FOLLOWER_OF_CREATOR',
  },
  {
    label: 'Friends',
    value: 'friends',
    providerValue: 'MUTUAL_FOLLOW_FRIENDS',
  },
  { label: 'Only me', value: 'private', providerValue: 'SELF_ONLY' },
] as const;

/** TikTok target setting that labels a post as AI-generated. */
export const TIKTOK_AI_GENERATED_SETTING_KEY = 'aiGenerated';

/**
 * The catalog entry for the AI label. On by default because what Genfeed
 * publishes is generated in Genfeed; turn it off for a real video or photo
 * you uploaded. TikTok's inbox hand-off for videos documents no such flag,
 * so a video sent to the TikTok app carries none.
 */
export const TIKTOK_AI_GENERATED_SETTING: ChannelSettingDefinition = {
  defaultValue: true,
  description:
    'Sends the AI-generated label (is_aigc) to TikTok. Turn it off for a real video or photo you uploaded.',
  key: TIKTOK_AI_GENERATED_SETTING_KEY,
  label: 'Label as AI-generated',
  type: 'boolean',
};

/**
 * The audience a TikTok post's Privacy setting limits it to: private for
 * Followers, Friends and Only me, nothing for Everyone or an unset value, so
 * the post keeps the audience it asked for. Followers and Friends are not
 * public, so the public Genfeed profile must not list them.
 */
export function tikTokAppliedVisibility(
  targetSettings: unknown,
): PostVisibility | undefined {
  const privacyLevel =
    targetSettings && typeof targetSettings === 'object'
      ? (targetSettings as Record<string, unknown>).privacyLevel
      : undefined;
  const selected = TIKTOK_PRIVACY_OPTIONS.find(
    (option) => option.value === privacyLevel,
  );
  return selected && selected.value !== 'public'
    ? PostVisibility.PRIVATE
    : undefined;
}

const capabilitiesSchema = z.object({
  creatorNickname: z.string().min(1),
  creatorUsername: z.string().min(1),
  privacyLevelOptions: z.array(z.string().min(1)).min(1),
  commentDisabled: z.boolean(),
  duetDisabled: z.boolean(),
  stitchDisabled: z.boolean(),
  maxVideoPostDurationSeconds: z.number().positive(),
});

export type TikTokPublishingCapabilities = z.infer<typeof capabilitiesSchema>;

export function readTikTokPublishingCapabilities(
  warmupSignals: unknown,
): TikTokPublishingCapabilities | null {
  const parsed = z
    .object({ tiktokAuthorized: tiktokAuthorizedSignalsSnapshotSchema })
    .safeParse(warmupSignals);
  if (!parsed.success) return null;
  const snapshot = parsed.data.tiktokAuthorized;
  const evidence = snapshot.evidence.find(
    (item) => item.key === 'creator-capabilities-snapshot',
  );
  if (
    evidence?.status !== 'available' ||
    evidence.observedAt !== snapshot.refreshAttemptedAt
  )
    return null;
  const result = capabilitiesSchema.safeParse(evidence.value);
  return result.success ? result.data : null;
}

export function validateTikTokPublishingSettings(
  settings: Record<string, unknown>,
  privacyOptions?: string[],
): string[] {
  const issues: string[] = [];
  const selected = TIKTOK_PRIVACY_OPTIONS.find(
    (option) => option.value === settings.privacyLevel,
  );
  if (!selected) issues.push('Choose a TikTok privacy status.');
  else if (privacyOptions && !privacyOptions.includes(selected.providerValue))
    issues.push(
      'This privacy status is not available for this TikTok account.',
    );
  if (settings.musicUsageAccepted !== true)
    issues.push('Confirm TikTok’s Music Usage Confirmation before posting.');
  if (settings.commercialContent === true) {
    if (settings.yourBrand !== true && settings.brandedContent !== true)
      issues.push('Choose Your brand, Branded content, or both.');
    if (settings.brandedContent === true && settings.privacyLevel === 'private')
      issues.push('Branded content cannot be private.');
  }
  return issues;
}
