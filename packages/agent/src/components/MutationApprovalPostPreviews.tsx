import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { formatPlatformLabel } from '@genfeedai/contracts';
import type { AgentMutationApprovalPostPreview } from '@genfeedai/contracts/interfaces';
import PlatformPreview, {
  type PlatformPreviewMedia,
} from '@ui/posts/platform-preview/PlatformPreview';
import { resolvePreviewAuthor } from '@ui/posts/platform-preview/preview-author';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

interface MutationApprovalPostPreviewsProps {
  previews: AgentMutationApprovalPostPreview[];
}

const VIDEO_URL_PATTERN = /\.(mp4|mov|m4v|webm)(?:[?#].*)?$/i;

function toPreviewMedia(
  mediaUrls: string[],
  platform: string,
): PlatformPreviewMedia[] {
  return mediaUrls.map((url, index) => ({
    alt: `${formatPlatformLabel(platform) ?? platform} draft media ${index + 1}`,
    id: `${platform}:${index}`,
    kind: VIDEO_URL_PATTERN.test(url) ? 'video' : 'image',
    url,
  }));
}

export function readPostPreviews(
  data: Record<string, unknown> | undefined,
): AgentMutationApprovalPostPreview[] {
  const entries: unknown[] = Array.isArray(data?.postPreviews)
    ? data.postPreviews
    : [];
  const previews: AgentMutationApprovalPostPreview[] = [];
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object') {
      continue;
    }
    const { caption, credentialId, mediaUrls, platform } = entry as Record<
      string,
      unknown
    >;
    if (
      typeof platform !== 'string' ||
      typeof caption !== 'string' ||
      !caption.trim()
    ) {
      continue;
    }
    previews.push({
      caption,
      credentialId: typeof credentialId === 'string' ? credentialId : undefined,
      mediaUrls: Array.isArray(mediaUrls)
        ? mediaUrls.filter((url): url is string => typeof url === 'string')
        : [],
      platform,
    });
  }
  return previews;
}

/**
 * The post as it will read on each platform, authored by the brand's
 * connected account (avatar and handle), instead of a key/value dump.
 */
export function MutationApprovalPostPreviews({
  previews,
}: MutationApprovalPostPreviewsProps): ReactElement {
  const translate = useTranslations('agent.mutationApproval');
  const brandScope = useBrand();

  return (
    <div className="mt-3 space-y-3" data-testid="mutation-approval-previews">
      {previews.map((preview) => (
        <PlatformPreview
          key={`${preview.platform}:${preview.credentialId ?? ''}:${preview.caption}`}
          className="max-h-[26rem] overflow-y-auto"
          emptyMessage={translate('noPostPreview')}
          showValidation={false}
          target={{
            author: resolvePreviewAuthor(brandScope, {
              credentialId: preview.credentialId,
              platform: preview.platform,
            }),
            caption: preview.caption,
            media: toPreviewMedia(preview.mediaUrls, preview.platform),
            platform: preview.platform,
          }}
        />
      ))}
    </div>
  );
}
