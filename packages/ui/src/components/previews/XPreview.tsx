'use client';

import { CredentialPlatform } from '@genfeedai/contracts';
import { getPlatformPreviewLimit } from '@genfeedai/contracts/constants/platform-limits.constant';
import type { TargetPreviewProps } from '@genfeedai/props/ui/previews.props';

import MediaPreview from './MediaPreview';
import PreviewShell, {
  CaptionText,
  CharacterCounter,
  FirstCommentBlock,
} from './PreviewShell';
import {
  getCaptionPreviewState,
  resolveFirstComment,
  resolveSignature,
  resolveTargetCaption,
} from './preview.helpers';

export default function XPreview({
  release,
  target,
  credential,
  className,
}: TargetPreviewProps) {
  const limit = getPlatformPreviewLimit(CredentialPlatform.TWITTER);
  const caption = resolveTargetCaption(release, target);
  const signature = resolveSignature(release, target);
  const fullCaption = signature ? `${caption}\n\n${signature}` : caption;
  const captionState = getCaptionPreviewState(
    fullCaption,
    limit?.captionMaxLength,
  );
  const firstComment = resolveFirstComment(release, target);

  return (
    <PreviewShell
      className={className}
      credential={credential}
      platform={CredentialPlatform.TWITTER}
    >
      <CaptionText text={captionState.text} />
      <MediaPreview
        aspect={limit?.mediaAspect ?? '16:9'}
        media={release.media}
      />
      <div className="mt-2 flex justify-end">
        <CharacterCounter state={captionState} />
      </div>
      <FirstCommentBlock comment={firstComment} />
    </PreviewShell>
  );
}
