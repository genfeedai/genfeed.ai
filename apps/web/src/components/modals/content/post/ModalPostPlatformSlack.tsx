'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import {
  ServicesService,
  type SlackChannelOption,
} from '@services/external/services.service';
import FormControl from '@ui/primitives/field';
import { SelectField } from '@ui/primitives/select';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

type Props = {
  /** The connected Slack workspace the channel is chosen from. */
  credentialId: string;
  channelId: string;
  isLoading: boolean;
  onChannelChange: (channelId: string) => void;
};

/** A Slack post goes to one channel of the connected workspace. */
export default function ModalPostPlatformSlack({
  credentialId,
  channelId,
  isLoading,
  onChannelChange,
}: Props) {
  const t = useTranslations('ui.postComposer');
  const { brandId } = useBrand();
  const getServicesService = useAuthedService(
    (token) => new ServicesService('slack', token),
  );
  const [channels, setChannels] = useState<SlackChannelOption[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [hasLoadFailed, setHasLoadFailed] = useState(false);

  // use-effect-audit: ignore abortable request
  useEffect(() => {
    if (!brandId || !credentialId) {
      return;
    }

    const controller = new AbortController();
    setChannels([]);
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
      error={hasLoadFailed ? t('slackChannelLoadFailed') : undefined}
      helpText={t('slackChannelHelp')}
      isRequired
      label={t('slackChannel')}
    >
      <SelectField
        name={`slackChannel-${credentialId}`}
        value={channelId}
        onChange={(event) => onChannelChange(event.target.value)}
        isDisabled={isLoading || isLoadingChannels}
      >
        <option value="">
          {isLoadingChannels
            ? t('slackChannelLoading')
            : t('slackChannelPlaceholder')}
        </option>
        {channels.map((channel) => (
          <option key={channel.id} value={channel.id}>
            {`#${channel.name}${channel.isPrivate ? t('slackChannelPrivateSuffix') : ''}`}
          </option>
        ))}
      </SelectField>
    </FormControl>
  );
}
