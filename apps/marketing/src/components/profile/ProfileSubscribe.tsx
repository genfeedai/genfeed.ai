import type { ProfileSubscribeProps } from '@props/content/creator.props';

/**
 * Where a reader subscribes to a creator by email. Subscriptions are not
 * collected yet, so the slot renders nothing; the profile rail and the end of
 * every article already mount it with the creator's brand id.
 */
export default function ProfileSubscribe(
  _props: ProfileSubscribeProps,
): React.ReactElement | null {
  return null;
}
