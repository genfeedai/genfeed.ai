'use client';

import type { ICredential } from '@genfeedai/interfaces';
import Card from '@ui/card/Card';
import PlatformPreview, {
  type PlatformPreviewTarget,
} from '@ui/posts/platform-preview/PlatformPreview';
import {
  DESKTOP_PLATFORM_OPTIONS,
  type GenerationFormat,
  getCredentialLabel,
  SOCIAL_FORMAT_LABELS,
} from './posts-write-page.helpers';

interface PostsWritePreviewPanelProps {
  desktopPlatform: string;
  draftSegments: string[];
  selectedCredential: ICredential | undefined;
  selectedFormat: GenerationFormat;
  workingTitle: string;
}

function buildPreviewTarget({
  desktopPlatform,
  draftSegments,
  selectedCredential,
  selectedFormat,
  workingTitle,
}: PostsWritePreviewPanelProps): PlatformPreviewTarget {
  const platform = selectedCredential?.platform ?? desktopPlatform;
  const platformLabel =
    DESKTOP_PLATFORM_OPTIONS.find((option) => option.value === desktopPlatform)
      ?.label ?? 'Desktop';
  const authorName =
    selectedCredential?.label?.trim() ||
    selectedCredential?.externalHandle?.trim() ||
    platformLabel;
  const caption = draftSegments.join('\n\n');

  return {
    author: {
      handle: selectedCredential?.externalHandle ?? platform,
      name: authorName,
    },
    caption,
    platform,
    threadSegments:
      selectedFormat === 'thread'
        ? draftSegments.map((segment, index) => ({
            caption: segment,
            id: `draft-segment-${index.toString()}`,
            label: `Post ${index + 1}`,
          }))
        : undefined,
    title: workingTitle,
  };
}

export default function PostsWritePreviewPanel({
  desktopPlatform,
  draftSegments,
  selectedCredential,
  selectedFormat,
  workingTitle,
}: PostsWritePreviewPanelProps) {
  const previewTarget = buildPreviewTarget({
    desktopPlatform,
    draftSegments,
    selectedCredential,
    selectedFormat,
    workingTitle,
  });

  return (
    <Card bodyClassName="gap-0 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">Preview</h2>
          <p className="mt-1 text-sm text-foreground/55">
            {SOCIAL_FORMAT_LABELS[selectedFormat]} for{' '}
            {selectedCredential
              ? getCredentialLabel(selectedCredential)
              : DESKTOP_PLATFORM_OPTIONS.find(
                  (option) => option.value === desktopPlatform,
                )?.label}
          </p>
        </div>
        <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-foreground/55">
          {draftSegments.length} {draftSegments.length === 1 ? 'post' : 'posts'}
        </span>
      </div>

      <PlatformPreview className="mt-5" target={previewTarget} />

      <div className="mt-5 border-t border-white/10 pt-4 text-sm text-foreground/60">
        <p className="font-medium text-foreground">Agent context</p>
        <p className="mt-1">
          The co-pilot sees the current draft, selected text, format, account,
          and prompt instructions while you write.
        </p>
      </div>
    </Card>
  );
}
