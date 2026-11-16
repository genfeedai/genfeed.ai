'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import type { IPostPlatformConfig } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import {
  ServicesService,
  type SlackChannelOption,
} from '@services/external/services.service';
import FormControl from '@ui/primitives/field';
import { SelectField } from '@ui/primitives/select';
import { useEffect, useState } from 'react';

type Props = {
  config: IPostPlatformConfig;
  isEnabled: boolean;
  isLoading: boolean;
  updatePlatformConfig: (
    credentialId: string,
    updates: Partial<IPostPlatformConfig>,
  ) => void;
};

/** A Slack post goes to one channel of the connected workspace. */
export default function ModalPostPlatformSlack({
  config,
  isEnabled,
  isLoading,
  updatePlatformConfig,
}: Props) {
  const { brandId } = useBrand();
  const getServicesService = useAuthedService(
    (token) => new ServicesService('slack', token),
  );
  const [channels, setChannels] = useState<SlackChannelOption[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [hasLoadFailed, setHasLoadFailed] = useState(false);
  const { credentialId } = config;
  const channelId =
    typeof config.targetSettings?.channelId === 'string'
      ? config.targetSettings.channelId
      : '';

  useEffect(() => {
    if (!brandId || !credentialId) {
      return;
    }

    const controller = new AbortController();
    setIsLoadingChannels(true);
    setHasLoadFailed(false);

    void (async () => {
      try {
        const service = await getServicesService();
        const found = await service.getSlackChannels(
          brandId,
          credentialId,
          controller.signal,
        );
        setChannels(found);
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error('Failed to load Slack channels', error);
          setHasLoadFailed(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingChannels(false);
        }
      }
    })();

    return () => controller.abort();
  }, [brandId, credentialId, getServicesService]);

  return (
    <FormControl
      error={
        hasLoadFailed
          ? 'Channels could not be loaded. Reconnect Slack and try again.'
          : undefined
      }
      helpText="Invite the Genfeed app to a private channel before posting to it."
      isRequired
      label="Slack channel"
    >
      <SelectField
        name={`slackChannel-${credentialId}`}
        value={channelId}
        onChange={(event) => {
          if (!isEnabled) {
            return;
          }

          updatePlatformConfig(credentialId, {
            targetSettings: { channelId: event.target.value },
          });
        }}
        isDisabled={!isEnabled || isLoading || isLoadingChannels}
      >
        <option value="">
          {isLoadingChannels ? 'Loading channels…' : 'Choose a channel'}
        </option>
        {channels.map((channel) => (
          <option key={channel.id} value={channel.id}>
            {`#${channel.name}${channel.isPrivate ? ' (private)' : ''}`}
          </option>
        ))}
      </SelectField>
    </FormControl>
  );
}
