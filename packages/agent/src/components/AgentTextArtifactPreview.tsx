'use client';

import { SafeMarkdown } from '@genfeedai/agent/components/SafeMarkdown';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import PlatformPreview, {
  type PlatformPreviewThreadSegment,
} from '@ui/posts/platform-preview/PlatformPreview';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '@ui/primitives/dialog';
import { Clipboard, Expand, Mail } from 'lucide-react';
import { type ReactElement, useState } from 'react';

export interface AgentTextArtifactPreviewData {
  content: string;
  contentFormat?: AgentUiAction['contentFormat'];
  platform?: string;
  preheader?: string;
  subject?: string;
  threadSegments?: string[];
  title?: string;
}

function isNewsletterPreview(data: AgentTextArtifactPreviewData): boolean {
  const platform = data.platform?.trim().toLowerCase();
  return (
    data.contentFormat === 'newsletter' ||
    platform === 'beehiiv' ||
    platform === 'email' ||
    platform === 'newsletter' ||
    platform === 'substack'
  );
}

function buildThreadSegments(
  values: string[] | undefined,
): PlatformPreviewThreadSegment[] | undefined {
  if (!values || values.length <= 1) {
    return undefined;
  }

  return values.map((caption, index) => ({
    caption,
    id: `segment-${index + 1}`,
    label: `Post ${index + 1}`,
  }));
}

function NewsletterPreview({
  data,
  expanded,
}: {
  data: AgentTextArtifactPreviewData;
  expanded: boolean;
}): ReactElement {
  const subject = data.subject?.trim() || data.title?.trim() || 'Newsletter';

  return (
    <article
      aria-label="Newsletter reader preview"
      className="overflow-hidden rounded-lg bg-background-secondary shadow-border"
    >
      <header className="space-y-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <Mail className="size-3.5" />
          Newsletter preview
        </div>
        <h3 className="text-base font-semibold tracking-[-0.02em] text-foreground">
          {subject}
        </h3>
        <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-[4rem_1fr]">
          <span>From</span>
          <span className="text-foreground/75">Your publication</span>
          <span>To</span>
          <span className="text-foreground/75">Subscribers</span>
        </div>
        {data.preheader?.trim() ? (
          <p className="text-xs leading-5 text-muted-foreground">
            {data.preheader}
          </p>
        ) : null}
      </header>
      <div
        className={cn(
          'bg-background px-5 py-5',
          expanded ? 'min-h-80' : 'max-h-72 overflow-hidden',
        )}
      >
        <SafeMarkdown
          className="max-w-none text-sm leading-7 text-foreground/88"
          content={data.content}
          enhanceStructure
        />
      </div>
    </article>
  );
}

function ArtifactPreviewBody({
  data,
  expanded,
}: {
  data: AgentTextArtifactPreviewData;
  expanded: boolean;
}): ReactElement {
  if (isNewsletterPreview(data)) {
    return <NewsletterPreview data={data} expanded={expanded} />;
  }

  const threadSegments = buildThreadSegments(data.threadSegments);
  if (data.platform?.trim()) {
    return (
      <PlatformPreview
        target={{
          caption: threadSegments?.[0]?.caption ?? data.content,
          platform: data.platform,
          threadSegments,
          title: data.title,
        }}
      />
    );
  }

  return (
    <article
      aria-label="Text artifact preview"
      className="rounded-lg bg-background-secondary p-4 shadow-border"
    >
      <SafeMarkdown
        className="max-w-none text-sm leading-7 text-foreground/88"
        content={data.content}
        enhanceStructure
      />
    </article>
  );
}

export function AgentTextArtifactPreview({
  data,
  className,
  onCopy,
}: {
  data: AgentTextArtifactPreviewData;
  className?: string;
  onCopy?: (content: string) => void | Promise<void>;
}): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const copyContent = data.threadSegments?.join('\n\n') ?? data.content;
  const previewLabel = isNewsletterPreview(data)
    ? 'newsletter'
    : data.platform?.trim() || 'text';

  return (
    <div className={cn('space-y-2', className)}>
      <ArtifactPreviewBody data={data} expanded />
      <div className="flex justify-end gap-1">
        {onCopy ? (
          <Button
            ariaLabel={`Copy ${previewLabel} output`}
            icon={<Clipboard className="size-3.5" />}
            label="Copy"
            onClick={() => onCopy(copyContent)}
            size={ButtonSize.XS}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
        ) : null}
        <Button
          ariaLabel={`Expand ${previewLabel} preview`}
          icon={<Expand className="size-3.5" />}
          label="Open preview"
          onClick={() => setIsOpen(true)}
          size={ButtonSize.XS}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogPortal>
          <DialogOverlay
            className={
              'bg-black/60 backdrop-blur-[1px]' /* design-system-allow-content-color */
            }
          />
          <DialogContent className="max-h-[90dvh] max-w-3xl overflow-hidden border-border-strong bg-popover p-0">
            <DialogHeader className="border-b border-border px-5 py-4">
              <DialogTitle>{data.title || 'Content preview'}</DialogTitle>
              <DialogDescription>
                Format-aware preview · content remains editable until publish
              </DialogDescription>
            </DialogHeader>
            <div className="overflow-y-auto p-5">
              <ArtifactPreviewBody data={data} expanded />
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </div>
  );
}
