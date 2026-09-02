'use client';

import {
  ButtonSize,
  ButtonVariant,
  PostVisibility,
} from '@genfeedai/contracts';
import type { IPostPlatformConfig } from '@genfeedai/contracts/interfaces';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { Sparkles } from 'lucide-react';

import ModalPostPlatformInstagram from './ModalPostPlatformInstagram';
import ModalPostPlatformTitleField from './ModalPostPlatformTitleField';
import { platformColors, platformIcons } from './platform-map.constants';

type Props = {
  config: IPostPlatformConfig;
  isLoading: boolean;
  isEnabled: boolean;
  isTwitter: boolean;
  isYoutube: boolean;
  isInstagram: boolean;
  currentLength: number;
  globalLabel: string | undefined;
  globalDescription: string | undefined;
  generatingTitleFor: string | null;
  generatingDescFor: string | null;
  updatePlatformConfig: (
    credentialId: string,
    updates: Partial<IPostPlatformConfig>,
  ) => void;
  getMinDateTime: () => Date;
  handleGenerateContent: (
    credentialId: string,
    platform: string,
    field: 'title' | 'description',
  ) => void;
};

export default function ModalPostPlatformCard({
  config,
  isLoading,
  isEnabled,
  isTwitter,
  isYoutube,
  isInstagram,
  currentLength,
  globalLabel,
  globalDescription,
  generatingTitleFor,
  generatingDescFor,
  updatePlatformConfig,
  getMinDateTime,
  handleGenerateContent,
}: Props) {
  const Icon = platformIcons[config.platform];
  const color = platformColors[config.platform];
  const hasCredential = !!config.credentialId;
  const isCredentialValid = config.isCredentialValid !== false;
  const isGeneratingDesc = generatingDescFor === config.credentialId;

  return (
    <div
      className={`bg-card shadow-border p-4 space-y-3 ${
        isEnabled ? '' : 'bg-muted/20'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {Icon && (
            <Icon
              className={`size-4 ${
                hasCredential ? color : 'text-foreground/40'
              }`}
            />
          )}
          {hasCredential && (
            <span className="text-xs text-foreground/60">@{config.handle}</span>
          )}
        </div>
        {!hasCredential && (
          <span className="text-xs text-warning">
            Connect account to enable
          </span>
        )}
        {hasCredential && !isCredentialValid && (
          <span className="text-xs text-warning">
            Reconnect account to publish
          </span>
        )}
      </div>

      {isYoutube && (
        <FormControl label="YouTube Visibility">
          <SelectField
            name={`youtubeStatus-${config.credentialId || config.platform}`}
            value={config.visibility}
            onChange={(event) => {
              if (!isEnabled) {
                return;
              }

              updatePlatformConfig(config.credentialId, {
                visibility: event.target.value as PostVisibility,
              });
            }}
            isDisabled={!isEnabled || isLoading}
          >
            <option value={PostVisibility.PUBLIC}>Public</option>
            <option value={PostVisibility.PRIVATE}>Private</option>
            <option value={PostVisibility.UNLISTED}>Unlisted</option>
          </SelectField>
        </FormControl>
      )}

      {isInstagram && (
        <ModalPostPlatformInstagram
          config={config}
          isEnabled={isEnabled}
          isLoading={isLoading}
          updatePlatformConfig={updatePlatformConfig}
        />
      )}

      {!isTwitter && (
        <ModalPostPlatformTitleField
          config={config}
          isEnabled={isEnabled}
          isLoading={isLoading}
          globalLabel={globalLabel}
          generatingTitleFor={generatingTitleFor}
          updatePlatformConfig={updatePlatformConfig}
          handleGenerateContent={handleGenerateContent}
        />
      )}

      <div>
        <div className="flex items-center justify-between mb-1">
          <label
            htmlFor={`platform-description-${config.credentialId || config.platform}`}
            className="text-sm font-medium"
          >
            {isTwitter ? 'Tweet' : 'Description'}
          </label>
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.XS}
            className="gap-2"
            onClick={() =>
              handleGenerateContent(
                config.credentialId,
                config.platform,
                'description',
              )
            }
            isDisabled={!isEnabled || isLoading || isGeneratingDesc}
            isLoading={isGeneratingDesc}
            icon={<Sparkles className="size-3" />}
            label={isGeneratingDesc ? 'Generating…' : 'Generate'}
          />
        </div>

        <Textarea
          id={`platform-description-${config.credentialId || config.platform}`}
          className={isTwitter ? 'h-20' : 'h-24'}
          value={config.description}
          onChange={(event) => {
            if (!isEnabled) {
              return;
            }

            updatePlatformConfig(config.credentialId, {
              description: event.target.value,
            });
          }}
          placeholder={
            isTwitter
              ? "What's happening?"
              : globalDescription || 'Enter description'
          }
          disabled={!isEnabled || isLoading}
        />

        {isTwitter && (
          <p className="text-xs text-foreground/70 mt-1">
            {280 - currentLength} characters remaining
          </p>
        )}
      </div>

      <Checkbox
        name={`override-${config.platform}`}
        label="Override schedule time"
        className="checkbox-xs"
        isChecked={config.overrideSchedule}
        onChange={(event) => {
          if (!isEnabled) {
            return;
          }

          updatePlatformConfig(config.credentialId, {
            customScheduledDate: event.target.checked
              ? config.customScheduledDate
              : '',
            overrideSchedule: event.target.checked,
          });
        }}
        isDisabled={!isEnabled || isLoading}
      />

      {config.overrideSchedule && (
        <Input
          type="datetime-local"
          value={config.customScheduledDate}
          onChange={(event) => {
            if (!isEnabled) {
              return;
            }

            updatePlatformConfig(config.credentialId, {
              customScheduledDate: event.target.value,
            });
          }}
          min={getMinDateTime().toISOString().slice(0, 16)}
          disabled={!isEnabled || isLoading}
        />
      )}
    </div>
  );
}
