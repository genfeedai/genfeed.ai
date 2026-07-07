'use client';

import type { DesktopContentPlatform } from '@genfeedai/desktop-contracts';
import { CredentialPlatform } from '@genfeedai/enums';
import type { ICredential } from '@genfeedai/interfaces';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import {
  DESKTOP_PLATFORM_OPTIONS,
  type GenerationFormat,
  getCharacterLimit,
  getCredentialLabel,
  SOCIAL_FORMAT_LABELS,
  toDesktopPlatform,
} from './posts-write-page.helpers';

function getFormatConstraintLabel(
  credential: ICredential | undefined,
  format: GenerationFormat,
): string {
  const platform = credential?.platform;

  if (
    String(platform ?? '').toLowerCase() === CredentialPlatform.TWITTER &&
    format === 'x-article'
  ) {
    return 'Copy-only X Article export';
  }

  if (String(platform ?? '').toLowerCase() === CredentialPlatform.TWITTER) {
    const limit = getCharacterLimit(
      credential,
      toDesktopPlatform(credential?.platform),
    );
    return limit
      ? `${limit} weighted characters per post`
      : 'Weighted characters per post';
  }

  if (String(platform ?? '').toLowerCase() === CredentialPlatform.INSTAGRAM) {
    return 'Caption-ready account context';
  }

  if (String(platform ?? '').toLowerCase() === CredentialPlatform.YOUTUBE) {
    return 'Long-form platform copy context';
  }

  return 'Account-aware draft context';
}

function getFormatPublishabilityLabel(format: GenerationFormat): string {
  return format === 'x-article' ? 'Copy only' : 'Publishable';
}

interface PostsWriteAccountBarProps {
  connectedCredentials: ICredential[];
  desktop: boolean;
  desktopPlatform: DesktopContentPlatform;
  formatOptions: Array<{ label: string; value: GenerationFormat }>;
  hasConnectedCredentials: boolean;
  hasPrefilledIngredient: boolean;
  onDesktopPlatformChange: (value: DesktopContentPlatform) => void;
  onFormatChange: (value: GenerationFormat) => void;
  onCredentialChange: (value: string) => void;
  selectedCredential: ICredential | undefined;
  selectedCredentialId: string;
  selectedFormat: GenerationFormat;
}

export default function PostsWriteAccountBar({
  connectedCredentials,
  desktop,
  desktopPlatform,
  formatOptions,
  hasConnectedCredentials,
  hasPrefilledIngredient,
  onCredentialChange,
  onDesktopPlatformChange,
  onFormatChange,
  selectedCredential,
  selectedCredentialId,
  selectedFormat,
}: PostsWriteAccountBarProps) {
  return (
    <>
      {hasPrefilledIngredient ? (
        <InsetSurface
          className="bg-tertiary text-sm text-muted-foreground"
          tone="default"
        >
          A generated asset is preselected for supervised review. Save a draft
          in Genfeed to open it directly in the post editor before scheduling or
          publishing.
        </InsetSurface>
      ) : null}

      {!hasConnectedCredentials ? (
        <InsetSurface
          className="border-dashed bg-black/10 text-sm text-foreground/65"
          tone="contrast"
        >
          Post mode is open right away. You can write and copy content now, then
          connect an account later if you want to save or publish inside
          Genfeed.
        </InsetSurface>
      ) : (
        <div className="grid gap-2 text-sm text-foreground/75">
          <span>Account</span>
          <Select
            value={selectedCredentialId}
            onValueChange={onCredentialChange}
          >
            <SelectTrigger aria-label="Account">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {connectedCredentials.map((credential) => (
                <SelectItem key={credential.id} value={credential.id}>
                  {getCredentialLabel(credential)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {desktop && !selectedCredential ? (
        <div className="grid gap-2 text-sm text-foreground/75">
          <span>Platform</span>
          <Select
            value={desktopPlatform}
            onValueChange={(value) =>
              onDesktopPlatformChange(value as DesktopContentPlatform)
            }
          >
            <SelectTrigger aria-label="Platform">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DESKTOP_PLATFORM_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="grid gap-2 text-sm text-foreground/75">
        <span>Format</span>
        <Select
          value={selectedFormat}
          onValueChange={(value) => onFormatChange(value as GenerationFormat)}
        >
          <SelectTrigger aria-label="Format">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {formatOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedCredential ? (
        <InsetSurface
          className="border-white/10 bg-black/10 text-sm text-foreground/70"
          tone="contrast"
        >
          {getCredentialLabel(selectedCredential)} ·{' '}
          {SOCIAL_FORMAT_LABELS[selectedFormat]} ·{' '}
          {getFormatPublishabilityLabel(selectedFormat)} ·{' '}
          {getFormatConstraintLabel(selectedCredential, selectedFormat)}
        </InsetSurface>
      ) : null}
    </>
  );
}
