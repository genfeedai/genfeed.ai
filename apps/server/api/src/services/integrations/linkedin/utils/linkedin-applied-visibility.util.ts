import { PostVisibility } from '@genfeedai/contracts';
import {
  type ChannelTargetSettings,
  readChannelSettingString,
} from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';

/**
 * The audience LinkedIn limits a post to when the channel setting is
 * Connections: private, so the post stays off the public Genfeed profile.
 * Nothing for Public or an unset value, so the post keeps the audience it
 * asked for.
 */
export function resolveLinkedInAppliedVisibility(
  settings: ChannelTargetSettings,
): PostVisibility | undefined {
  return readChannelSettingString(settings, 'visibility') === 'CONNECTIONS'
    ? PostVisibility.PRIVATE
    : undefined;
}
