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
import type { ModalPostChannelListProps } from '@genfeedai/props/modals/modal.props';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Avatar } from '@ui/primitives/avatar';
import { Button } from '@ui/primitives/button';
import { Switch } from '@ui/primitives/switch';
import { Plus } from 'lucide-react';

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

function isSelectable(config: IPostPlatformConfig): boolean {
  return Boolean(config.credentialId) && config.isCredentialValid !== false;
}

/**
 * Channels step of the publish modal: one row per destination with its
 * avatar and platform badge, the caption it will carry, an Edit disclosure for
 * per-channel overrides and an on/off switch. A channel that is not connected,
 * or whose connection expired, offers Connect / Reconnect instead of a switch.
 */
export default function ModalPostChannelList({
  platformConfigs,
  credentials,
  globalDescription,
  expandedPlatform,
  isLoading,
  onToggle,
  onToggleAll,
  onToggleExpanded,
  onAddChannels,
  renderEditor,
}: ModalPostChannelListProps) {
  const selectableCount = platformConfigs.filter(isSelectable).length;
  const activeCount = platformConfigs.filter(
    (config) => isSelectable(config) && config.enabled,
  ).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <p>
          <span className="font-semibold">{activeCount}</span> of{' '}
          {selectableCount} active
        </p>
        <div className="flex items-center gap-1">
          <span className="pr-1 text-foreground/60">Toggle all</span>
          <Button
            type="button"
            ariaLabel="Turn all channels off"
            isDisabled={isLoading || activeCount === 0}
            label="Off"
            onClick={() => onToggleAll(false)}
            size={ButtonSize.XS}
            variant={ButtonVariant.GHOST}
          />
          <Button
            type="button"
            ariaLabel="Turn all channels on"
            isDisabled={isLoading || activeCount === selectableCount}
            label="On"
            onClick={() => onToggleAll(true)}
            size={ButtonSize.XS}
            variant={ButtonVariant.GHOST}
          />
        </div>
      </div>

      <ul aria-label="Channels" className="divide-y divide-border">
        {platformConfigs.map((config) => {
          const credential = credentials.find(
            (item) => item.id === config.credentialId,
          );
          const name = getChannelName(config, credential);
          const hasCredential = Boolean(config.credentialId);
          const isCredentialValid = config.isCredentialValid !== false;
          const canToggle = isSelectable(config);
          const isExpanded =
            canToggle && config.enabled && expandedPlatform === config.platform;
          const caption = config.description || globalDescription;

          return (
            <li className="flex flex-col gap-3 py-3" key={config.platform}>
              <div className="flex items-center gap-3">
                <Avatar
                  badge={
                    <PlatformBadge
                      platform={config.platform}
                      showLabel={false}
                      variant="solid"
                    />
                  }
                  name={name}
                  size="lg"
                  src={credential?.externalAvatar}
                />
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-sm font-medium">{name}</span>
                  <span className="truncate text-xs text-foreground/60">
                    {!hasCredential
                      ? 'Not connected'
                      : !isCredentialValid
                        ? 'Reconnect this account to publish'
                        : caption || 'No caption yet'}
                  </span>
                </div>
                {canToggle ? (
                  <>
                    {config.enabled ? (
                      <Button
                        type="button"
                        ariaLabel={`Edit ${name}`}
                        isDisabled={isLoading}
                        label="Edit"
                        onClick={() => onToggleExpanded(config.platform)}
                        size={ButtonSize.SM}
                        variant={ButtonVariant.GHOST}
                      />
                    ) : null}
                    <Switch
                      aria-label={`Publish to ${name}`}
                      isChecked={config.enabled}
                      isDisabled={isLoading}
                      onCheckedChange={() => onToggle(config.credentialId)}
                    />
                  </>
                ) : (
                  <Button
                    type="button"
                    ariaLabel={`${hasCredential ? 'Reconnect' : 'Connect'} ${name}`}
                    isDisabled={!onAddChannels}
                    label={hasCredential ? 'Reconnect' : 'Connect'}
                    onClick={onAddChannels}
                    size={ButtonSize.SM}
                    variant={ButtonVariant.SECONDARY}
                  />
                )}
              </div>
              {isExpanded ? renderEditor(config) : null}
            </li>
          );
        })}
      </ul>

      {onAddChannels ? (
        <Button
          type="button"
          icon={<Plus className="size-4" />}
          isDisabled={isLoading}
          label="Add channels"
          onClick={onAddChannels}
          variant={ButtonVariant.SECONDARY}
        />
      ) : null}
    </div>
  );
}
