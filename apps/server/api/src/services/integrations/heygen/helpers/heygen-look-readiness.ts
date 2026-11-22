import type {
  groupSchema,
  lookSchema,
} from '@api/services/integrations/heygen/helpers/heygen-catalog';
import { getEligibleHeyGenAvatarEngines } from '@genfeedai/contracts/constants';
import type { z } from 'zod';

const VERIFIABLE_AVATAR_TYPES = [
  'studio_avatar',
  'digital_twin',
  'photo_avatar',
];

/**
 * Why a look cannot be rendered, or null when it can. Group readiness only
 * applies to private looks: a public preset is trusted from its filtered listing.
 */
export function getHeyGenLookUnusableReason({
  group,
  groupUnavailable,
  look,
  partition,
}: {
  group: z.infer<typeof groupSchema> | undefined;
  groupUnavailable: boolean;
  look: z.infer<typeof lookSchema>;
  partition: 'public' | 'private';
}): string | null {
  if (!look.avatar_type || !VERIFIABLE_AVATAR_TYPES.includes(look.avatar_type))
    return 'Avatar type could not be verified.';
  if (
    getEligibleHeyGenAvatarEngines({
      avatarType: look.avatar_type,
      supportedEngines: look.supported_api_engines,
    }).length === 0
  )
    return 'This look supports no HeyGen avatar engine Genfeed can price.';
  if (partition !== 'private') return null;
  if (look.status !== 'completed')
    return 'This look has not completed training.';
  if (
    groupUnavailable ||
    (look.group_id && (!group || group.id !== look.group_id))
  )
    return 'Avatar group readiness could not be verified.';
  if (group && group.status !== 'completed')
    return 'This avatar group is not ready.';
  if (
    group &&
    group.consent_status !== null &&
    group.consent_status !== 'accepted'
  )
    return 'Avatar consent is pending or rejected.';
  return null;
}
