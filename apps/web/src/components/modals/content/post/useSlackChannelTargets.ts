import { CredentialPlatform } from '@genfeedai/contracts';
import { useCallback, useRef, useState } from 'react';

const NO_CHANNELS: Record<string, string> = {};

/**
 * The Slack channel chosen for each connected workspace in the single-post
 * composer. A Slack post goes to one channel, so it is sent with the post as
 * its `channelId` target setting. A new `openVersion` starts from no choices,
 * so a reopened composer never keeps the previous post's channel.
 */
export function useSlackChannelTargets(openVersion: number) {
  const [chosen, setChosen] = useState({
    channelIds: NO_CHANNELS,
    openVersion,
  });
  const channelIds =
    chosen.openVersion === openVersion ? chosen.channelIds : NO_CHANNELS;
  const channelIdsRef = useRef(channelIds);
  channelIdsRef.current = channelIds;

  const setChannel = useCallback(
    (credentialId: string, channelId: string) => {
      setChosen((current) => ({
        channelIds: {
          ...(current.openVersion === openVersion ? current.channelIds : {}),
          [credentialId]: channelId,
        },
        openVersion,
      }));
    },
    [openVersion],
  );

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
