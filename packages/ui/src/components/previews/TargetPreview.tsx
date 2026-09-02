'use client';

import { CredentialPlatform, parsePlatform } from '@genfeedai/contracts';
import type { TargetPreviewProps } from '@genfeedai/props/ui/previews.props';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';

import InstagramPreview from './InstagramPreview';
import LinkedInPreview from './LinkedInPreview';
import PreviewShell, { CaptionText } from './PreviewShell';
import { resolveTargetCaption } from './preview.helpers';
import ThreadsPreview from './ThreadsPreview';
import TikTokPreview from './TikTokPreview';
import XPreview from './XPreview';
import YouTubePreview from './YouTubePreview';

const TARGET_PREVIEW_RENDERERS: Partial<
  Record<CredentialPlatform, ComponentType<TargetPreviewProps>>
> = {
  [CredentialPlatform.INSTAGRAM]: InstagramPreview,
  [CredentialPlatform.LINKEDIN]: LinkedInPreview,
  [CredentialPlatform.THREADS]: ThreadsPreview,
  [CredentialPlatform.TIKTOK]: TikTokPreview,
  [CredentialPlatform.TWITTER]: XPreview,
  [CredentialPlatform.YOUTUBE]: YouTubePreview,
};

function GenericTargetPreview({
  release,
  target,
  credential,
  className,
}: TargetPreviewProps) {
  const translate = useTranslations('common.previews');
  const caption = resolveTargetCaption(release, target);

  return (
    <PreviewShell
      className={className}
      credential={credential}
      eyebrow={translate('approximatePreview')}
      platform={target.platform}
    >
      <CaptionText text={caption} />
    </PreviewShell>
  );
}

/**
 * Routes a channel target to its dedicated platform renderer, falling back
 * to a neutral card for platforms without one yet.
 */
export default function TargetPreview(props: TargetPreviewProps) {
  const resolvedPlatform = parsePlatform(props.target.platform);
  const Renderer = resolvedPlatform
    ? TARGET_PREVIEW_RENDERERS[resolvedPlatform]
    : undefined;

  if (!Renderer) {
    return <GenericTargetPreview {...props} />;
  }

  return <Renderer {...props} />;
}
