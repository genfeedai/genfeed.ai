import { CredentialPlatform } from '@genfeedai/contracts';
import { useCallback, useRef, useState } from 'react';

/**
 * The Slack channel chosen for each connected workspace in the single-post
 * composer. A Slack post goes to one channel, so it is sent with the post as
 * its `channelId` target setting.
 */
export function useSlackChannelTargets() {
  const [channelIds, setChannelIds] = useState<Record<string, string>>({});
  const channelIdsRef = useRef(channelIds);
  channelIdsRef.current = channelIds;

  const setChannel = useCallback((credentialId: string, channelId: string) => {
    setChannelIds((current) => ({ ...current, [credentialId]: channelId }));
  }, []);

  const getTargetSettings = useCallback(
    (target: { id: string; platform: string } | null) => {
      const channelId = target ? channelIdsRef.current[target.id] : undefined;

      return target?.platform === CredentialPlatform.SLACK && channelId
        ? { targetSettings: { channelId } }
        : {};
    },
    [],
  );

  return { channelIds, getTargetSettings, setChannel };
}
