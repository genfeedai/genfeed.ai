'use client';

import type { ICredential } from '@genfeedai/interfaces';
import Card from '@ui/card/Card';

type GenerationFormat = 'post' | 'thread' | 'x-article';

const SOCIAL_FORMAT_LABELS: Record<GenerationFormat, string> = {
  post: 'Post',
  thread: 'Thread',
  'x-article': 'X Article',
};

const DESKTOP_PLATFORM_OPTIONS: Array<{
  label: string;
  value: string;
}> = [
  { label: 'X', value: 'twitter' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'YouTube', value: 'youtube' },
];

function getCredentialLabel(credential: ICredential): string {
  const platform = credential.platform;
  const handle =
    'externalHandle' in credential && credential.externalHandle
      ? `@${credential.externalHandle}`
      : null;

  return handle ? `${platform} ${handle}` : String(platform);
}

interface PostsWritePreviewPanelProps {
  characterLimit: number | null;
  desktopPlatform: string;
  draftSegments: string[];
  selectedCredential: ICredential | undefined;
  selectedFormat: GenerationFormat;
}

export default function PostsWritePreviewPanel({
  characterLimit,
  desktopPlatform,
  draftSegments,
  selectedCredential,
  selectedFormat,
}: PostsWritePreviewPanelProps) {
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

      <div className="mt-5 divide-y divide-white/10">
        {draftSegments.map((segment, index) => {
          const count = segment.length;
          const isOverLimit = characterLimit !== null && count > characterLimit;

          return (
            <div
              key={`preview-segment-${index.toString()}`}
              className="py-4 first:pt-0 last:pb-0"
            >
              <div className="mb-3 flex items-center justify-between gap-3 text-xs">
                <span className="font-medium text-foreground/70">
                  {selectedFormat === 'thread'
                    ? `Post ${index + 1}`
                    : SOCIAL_FORMAT_LABELS[selectedFormat]}
                </span>
                <span
                  className={
                    isOverLimit ? 'text-destructive' : 'text-foreground/40'
                  }
                >
                  {characterLimit ? `${count}/${characterLimit}` : count}
                </span>
              </div>
              {segment.trim() ? (
                <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/85">
                  {segment}
                </p>
              ) : (
                <p className="text-sm text-foreground/35">
                  Draft preview appears here.
                </p>
              )}
            </div>
          );
        })}
      </div>

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
