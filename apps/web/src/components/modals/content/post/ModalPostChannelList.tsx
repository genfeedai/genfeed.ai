'use client';

import {
  ButtonSize,
  ButtonVariant,
  formatPlatformLabel,
} from '@genfeedai/contracts';
import type {
  ICredential,
  IPostPlatformConfig,
} from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ModalPostChannelListProps } from '@genfeedai/props/modals/modal.props';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Avatar } from '@ui/primitives/avatar';
import { Button } from '@ui/primitives/button';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  getUnmetPostMediaRequirements,
  type PostMediaRequirement,
} from './post-media.helper';

function getChannelName(
  config: IPostPlatformConfig,
  credential: ICredential | undefined,
): string {
  return (
    credential?.externalName?.trim() ||
    credential?.label?.trim() ||
    (config.handle ? `@${config.handle}` : '') ||
    formatPlatformLabel(config.platform) ||
    config.platform
  );
}

/** What the attached media still lacks for this channel, or null when it fits. */
function getChannelMediaGap(
  config: IPostPlatformConfig,
  media: ModalPostChannelListProps['media'],
): Exclude<PostMediaRequirement, 'none'> | null {
  return (
    getUnmetPostMediaRequirements([config.platform], media)[0]?.requirement ??
    null
  );
}

/** A connected channel whose connection is valid and that can take the post. */
export function isChannelSelectable(
  config: IPostPlatformConfig,
  media: ModalPostChannelListProps['media'],
): boolean {
  return (
    Boolean(config.credentialId) &&
    config.isCredentialValid !== false &&
    getChannelMediaGap(config, media) === null
  );
}

/**
 * Channels step of the publish modal: one avatar per destination. Tapping a
 * connected avatar turns the channel on or off; a channel that cannot take the
 * attached media is disabled and says what it needs. A channel that is not
 * connected, or whose connection expired, offers Connect / Reconnect. Edit
 * opens the per-channel overrides under the grid.
 */
export default function ModalPostChannelList({
  platformConfigs,
  credentials,
  media,
  expandedPlatform,
  isLoading,
  onToggle,
  onToggleAll,
  onToggleExpanded,
  onAddChannels,
  renderEditor,
}: ModalPostChannelListProps) {
  const translate = useTranslations('ui.postBatch.channels');
  const selectableCount = platformConfigs.filter((config) =>
    isChannelSelectable(config, media),
  ).length;
  const activeCount = platformConfigs.filter(
    (config) => isChannelSelectable(config, media) && config.enabled,
  ).length;
  const expandedConfig = platformConfigs.find(
    (config) =>
      config.platform === expandedPlatform &&
      config.enabled &&
      isChannelSelectable(config, media),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <p>
          {translate('activeCount', {
            active: activeCount,
            total: selectableCount,
          })}
        </p>
        <div className="flex items-center gap-1">
          <span className="pr-1 text-foreground/60">
            {translate('toggleAll')}
          </span>
          <Button
            type="button"
            ariaLabel={translate('turnAllOff')}
            isDisabled={isLoading || activeCount === 0}
            label={translate('turnAllOffShort')}
            onClick={() => onToggleAll(false)}
            size={ButtonSize.XS}
            variant={ButtonVariant.GHOST}
          />
          <Button
            type="button"
            ariaLabel={translate('turnAllOn')}
            isDisabled={isLoading || activeCount === selectableCount}
            label={translate('turnAllOnShort')}
            onClick={() => onToggleAll(true)}
            size={ButtonSize.XS}
            variant={ButtonVariant.GHOST}
          />
        </div>
      </div>

      <ul
        aria-label={translate('listLabel')}
        className="grid grid-cols-3 gap-x-2 gap-y-4 pt-2 sm:grid-cols-4"
      >
        {platformConfigs.map((config) => {
          const credential = credentials.find(
            (item) => item.id === config.credentialId,
          );
          const name = getChannelName(config, credential);
          const hasCredential = Boolean(config.credentialId);
          const isCredentialValid = config.isCredentialValid !== false;
          const mediaGap = getChannelMediaGap(config, media);
          const isConnected = hasCredential && isCredentialValid;
          const isBlocked = isConnected && mediaGap !== null;
          const canToggle = isConnected && !isBlocked;
          const isOn = canToggle && config.enabled;
          const status = !isConnected
            ? hasCredential
              ? translate('reconnect')
              : translate('connect')
            : mediaGap
              ? translate(mediaGap === 'video' ? 'needsVideo' : 'needsMedia')
              : isOn
                ? translate('on')
                : translate('off');

          return (
            <li
              className="flex min-w-0 flex-col items-center gap-1.5 text-center"
              key={config.platform}
            >
              <div
                className={cn(
                  'rounded-full p-0.5 transition',
                  isOn
                    ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                    : 'ring-1 ring-transparent',
                  !isConnected && 'opacity-60',
                  isBlocked && 'opacity-40 grayscale',
                  canToggle &&
                    !isOn &&
                    'opacity-70 grayscale hover:opacity-100 hover:grayscale-0',
                )}
              >
                <Button
                  type="button"
                  aria-pressed={canToggle ? isOn : undefined}
                  ariaLabel={
                    !isConnected
                      ? hasCredential
                        ? translate('reconnectNamed', { name })
                        : translate('connectNamed', { name })
                      : translate('publishTo', { name })
                  }
                  isDisabled={
                    isBlocked || (isConnected ? isLoading : !onAddChannels)
                  }
                  onClick={() =>
                    isConnected
                      ? onToggle(config.credentialId)
                      : onAddChannels?.()
                  }
                  tooltip={isBlocked ? status : name}
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                >
                  <Avatar
                    badge={
                      <PlatformBadge
                        platform={config.platform}
                        showLabel={false}
                        variant="solid"
                      />
                    }
                    name={name}
                    size="xl"
                    src={credential?.externalAvatar}
                  />
                </Button>
              </div>
              <div className="flex min-w-0 max-w-full flex-col leading-tight">
                <span className="truncate text-xs font-medium">
                  {formatPlatformLabel(config.platform)}
                </span>
                <span className="truncate text-2xs text-muted-foreground">
                  {status}
                </span>
              </div>
              {isOn ? (
                <Button
                  type="button"
                  ariaLabel={translate('editNamed', { name })}
                  isDisabled={isLoading}
                  label={translate('edit')}
                  onClick={() => onToggleExpanded(config.platform)}
                  size={ButtonSize.XS}
                  variant={ButtonVariant.GHOST}
                />
              ) : null}
            </li>
          );
        })}
      </ul>

      {expandedConfig ? renderEditor(expandedConfig) : null}

      {onAddChannels ? (
        <Button
          type="button"
          icon={<Plus className="size-4" />}
          isDisabled={isLoading}
          label={translate('addChannels')}
          onClick={onAddChannels}
          variant={ButtonVariant.SECONDARY}
        />
      ) : null}
    </div>
  );
}
