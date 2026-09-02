'use client';

import { getPlatformPreviewLimit } from '@genfeedai/constants/platform-limits.constant';
import { CredentialPlatform } from '@genfeedai/enums';
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

export default function ThreadsPreview({
  release,
  target,
  credential,
  className,
}: TargetPreviewProps) {
  const limit = getPlatformPreviewLimit(CredentialPlatform.THREADS);
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
      platform={CredentialPlatform.THREADS}
    >
      <CaptionText text={captionState.text} />
      <MediaPreview
        aspect={limit?.mediaAspect ?? '1:1'}
        media={release.media}
      />
      <div className="mt-2 flex justify-end">
        <CharacterCounter state={captionState} />
      </div>
      <FirstCommentBlock comment={firstComment} />
    </PreviewShell>
  );
}
