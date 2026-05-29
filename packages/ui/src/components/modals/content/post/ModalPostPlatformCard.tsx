'use client';

import {
  ButtonSize,
  ButtonVariant,
  CredentialPlatform,
  PostCategory,
} from '@genfeedai/enums';
import type { IPostPlatformConfig } from '@genfeedai/interfaces';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { RadioGroup, RadioGroupItem } from '@ui/primitives/radio-group';
import { SelectField } from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { HiSparkles } from 'react-icons/hi2';
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

  return (
    <div
      className={`bg-card border border-white/[0.08] p-4 space-y-3 ${
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
            value={config.status || 'unlisted'}
            onChange={(event) => {
              if (!isEnabled) {
                return;
              }

              updatePlatformConfig(config.credentialId, {
                status: event.target.value,
              });
            }}
            isDisabled={!isEnabled || isLoading}
          >
            <option value="public">Public</option>
            <option value="private">Private</option>
            <option value="unlisted">Unlisted</option>
            <option value="scheduled">Scheduled</option>
          </SelectField>
        </FormControl>
      )}

      {isInstagram && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Instagram Post Type</p>

          <RadioGroup
            className="space-y-2"
            disabled={!isEnabled || isLoading}
            value={
              config.category === PostCategory.IMAGE
                ? 'image'
                : config.isShareToFeedSelected
                  ? 'video-feed'
                  : 'video-only'
            }
            onValueChange={(value) => {
              if (!isEnabled) {
                return;
              }

              if (value === 'image') {
                updatePlatformConfig(config.credentialId, {
                  category: PostCategory.IMAGE,
                  isShareToFeedSelected: false,
                });
                return;
              }

              updatePlatformConfig(config.credentialId, {
                category: PostCategory.VIDEO,
                isShareToFeedSelected: value === 'video-feed',
              });
            }}
          >
            {/* Image Post */}
            <label
              className="flex items-center gap-2 cursor-pointer"
              htmlFor={`${config.credentialId}-instagram-image`}
            >
              <RadioGroupItem
                id={`${config.credentialId}-instagram-image`}
                value="image"
              />
              <span className="text-sm">Image Post</span>
            </label>

            {/* Reel Only */}
            <label
              className="flex items-center gap-2 cursor-pointer"
              htmlFor={`${config.credentialId}-instagram-video-only`}
            >
              <RadioGroupItem
                id={`${config.credentialId}-instagram-video-only`}
                value="video-only"
              />
              <span className="text-sm">Reel only</span>
            </label>

            {/* Reel + Feed */}
            <label
              className="flex items-center gap-2 cursor-pointer"
              htmlFor={`${config.credentialId}-instagram-video-feed`}
            >
              <RadioGroupItem
                id={`${config.credentialId}-instagram-video-feed`}
                value="video-feed"
              />
              <span className="text-sm">Reel + Feed</span>
            </label>
          </RadioGroup>
        </div>
      )}

      {!isTwitter && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label
              htmlFor={`platform-title-${config.credentialId || config.platform}`}
              className="text-sm font-medium"
            >
              Title
            </label>
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.XS}
              className="gap-2"
              onClick={() =>
                handleGenerateContent(
                  config.credentialId,
                  config.platform,
                  'title',
                )
              }
              isDisabled={
                !isEnabled ||
                isLoading ||
                generatingTitleFor === config.credentialId
              }
              isLoading={generatingTitleFor === config.credentialId}
              icon={<HiSparkles className="size-3" />}
              label={
                generatingTitleFor === config.credentialId
                  ? 'Generating…'
                  : 'Generate'
              }
            />
          </div>
          <Input
            id={`platform-title-${config.credentialId || config.platform}`}
            type="text"
            value={config.label}
            onChange={(event) => {
              if (!isEnabled) {
                return;
              }

              updatePlatformConfig(config.credentialId, {
                label: event.target.value,
              });
            }}
            placeholder={globalLabel || 'Enter title'}
            disabled={!isEnabled || isLoading}
          />
        </div>
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
            isDisabled={
              !isEnabled ||
              isLoading ||
              generatingDescFor === config.credentialId
            }
            isLoading={generatingDescFor === config.credentialId}
            icon={<HiSparkles className="size-3" />}
            label={
              generatingDescFor === config.credentialId
                ? 'Generating…'
                : 'Generate'
            }
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
