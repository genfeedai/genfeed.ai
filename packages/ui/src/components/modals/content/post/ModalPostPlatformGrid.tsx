'use client';

import type { IPostPlatformConfig } from '@genfeedai/interfaces';
import { Checkbox } from '@ui/primitives/checkbox';
import { platformColors, platformIcons } from './platform-map.constants';

type Props = {
  platformConfigs: IPostPlatformConfig[];
  togglePlatform: (credentialId: string) => void;
};

export default function ModalPostPlatformGrid({
  platformConfigs,
  togglePlatform,
}: Props) {
  return (
    <div className="mb-6">
      <p className="text-sm font-medium mb-2">Available Platforms</p>

      <div className="grid grid-cols-4 gap-2">
        {platformConfigs.map((config) => {
          const Icon = platformIcons[config.platform];
          const color = platformColors[config.platform];
          const hasCredential = !!config.credentialId;
          const isCredentialValid = config.isCredentialValid !== false;
          const isEnabled =
            hasCredential && isCredentialValid && config.enabled;
          const isSelectable = hasCredential && isCredentialValid;

          return (
            <div
              key={config.platform}
              className={`bg-card border border-white/[0.08] p-3 ${
                isEnabled
                  ? 'ring-2 ring-primary/40'
                  : !hasCredential
                    ? 'opacity-60'
                    : ''
              }`}
            >
              <label
                className={`flex items-center gap-2 ${
                  hasCredential ? 'cursor-pointer' : 'cursor-not-allowed'
                }`}
              >
                <Checkbox
                  name={`platform-${config.platform}`}
                  isChecked={config.enabled}
                  onChange={() =>
                    isSelectable && togglePlatform(config.credentialId)
                  }
                  isDisabled={!isSelectable}
                />
                <div className="flex items-center gap-2 flex-1">
                  {Icon && (
                    <Icon
                      className={`size-4 ${hasCredential ? color : 'text-foreground/30'}`}
                    />
                  )}
                  {hasCredential && (
                    <span className="text-xs text-foreground/60">
                      @{config.handle}
                    </span>
                  )}
                </div>
              </label>
              {hasCredential && !isCredentialValid && (
                <span className="text-xs text-warning">
                  Reconnect account to enable
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
