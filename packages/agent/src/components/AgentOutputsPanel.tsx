import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import type {
  ThreadOutputGroup,
  ThreadOutputVariant,
} from '@genfeedai/agent/utils/extract-thread-outputs';
import { extractThreadOutputs } from '@genfeedai/agent/utils/extract-thread-outputs';
import { ButtonVariant } from '@genfeedai/enums';
import { Pre } from '@genfeedai/ui';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowTopRightOnSquare,
  HiOutlineChatBubbleLeftRight,
  HiOutlineDocumentText,
  HiOutlineMusicalNote,
  HiOutlinePhoto,
  HiOutlineVideoCamera,
} from 'react-icons/hi2';

interface AgentOutputsPanelProps {
  className?: string;
  emptyDescription?: string;
  emptyTitle?: string;
  mode?: 'compact' | 'standard';
}

function buildAttachContent(
  group: ThreadOutputGroup,
  variant: ThreadOutputVariant,
): string {
  if (variant.kind === 'text' && variant.textContent) {
    return variant.textContent;
  }

  const label = variant.title ?? group.title;
  return `Use this output in the current thread:\n${label}\n${variant.url ?? ''}`.trim();
}

function getVariantLabel(
  group: ThreadOutputGroup,
  variant: ThreadOutputVariant,
  index: number,
): string {
  if (variant.kind === 'text') {
    return variant.title ?? `Text ${index + 1}`;
  }

  return group.variants.length > 1 ? `Variant ${index + 1}` : 'Preview';
}

function renderVariantPreview(
  group: ThreadOutputGroup,
  variant: ThreadOutputVariant,
): ReactElement {
  if (variant.kind === 'video' && variant.url) {
    return (
      <video
        src={variant.url}
        controls
        className="gen-shell-surface aspect-[4/5] w-full rounded-[1.25rem] object-cover"
      >
        <track kind="captions" />
      </video>
    );
  }

  if (variant.kind === 'audio' && variant.url) {
    return (
      <div className="gen-shell-surface rounded-[1.25rem] p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <HiOutlineMusicalNote className="h-4 w-4 text-primary/80" />
          {variant.title ?? group.title}
        </div>
        <audio src={variant.url} controls className="w-full">
          <track kind="captions" />
        </audio>
      </div>
    );
  }

  if (variant.kind === 'text') {
    return (
      <div className="gen-shell-surface rounded-[1.25rem] p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <HiOutlineDocumentText className="h-4 w-4 text-primary/80" />
          {variant.title ?? group.title}
        </div>
        <Pre
          variant="ghost"
          size="md"
          className="max-h-[18rem] overflow-y-auto text-foreground/75"
        >
          {variant.textContent}
        </Pre>
      </div>
    );
  }

  if (variant.url) {
    return (
      <img
        src={variant.url}
        alt={variant.title ?? group.title}
        className="gen-shell-surface aspect-[4/5] w-full rounded-[1.25rem] object-cover"
      />
    );
  }

  return (
    <div className="gen-shell-empty-state rounded-[1.25rem] p-8 text-center text-sm text-foreground/55">
      No preview available.
    </div>
  );
}

function VariantIcon({
  kind,
}: {
  kind: ThreadOutputVariant['kind'];
}): ReactElement {
  if (kind === 'video') {
    return <HiOutlineVideoCamera className="h-4 w-4 text-primary/80" />;
  }

  if (kind === 'audio') {
    return <HiOutlineMusicalNote className="h-4 w-4 text-primary/80" />;
  }

  if (kind === 'text') {
    return <HiOutlineDocumentText className="h-4 w-4 text-primary/80" />;
  }

  return <HiOutlinePhoto className="h-4 w-4 text-primary/80" />;
}

export function AgentOutputsPanel({
  className,
  emptyDescription = 'Generated images, videos, audio, and text will accumulate here.',
  emptyTitle = 'No outputs yet',
  mode = 'standard',
}: AgentOutputsPanelProps): ReactElement {
  const activeThreadId = useAgentChatStore((s) => s.activeThreadId);
  const messages = useAgentChatStore((s) => s.messages);
  const seedComposer = useAgentChatStore((s) => s.seedComposer);
  const outputs = useMemo(() => extractThreadOutputs(messages), [messages]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (outputs.length === 0) {
      setSelectedGroupId(null);
      setSelectedVariantId(null);
      return;
    }

    const nextGroup =
      outputs.find((group) => group.id === selectedGroupId) ?? outputs[0];
    setSelectedGroupId(nextGroup.id);

    const nextVariant =
      nextGroup.variants.find((variant) => variant.id === selectedVariantId) ??
      nextGroup.variants[0];
    setSelectedVariantId(nextVariant?.id ?? null);
  }, [outputs, selectedGroupId, selectedVariantId]);

  const selectedGroup =
    outputs.find((group) => group.id === selectedGroupId) ?? null;
  const selectedVariant =
    selectedGroup?.variants.find(
      (variant) => variant.id === selectedVariantId,
    ) ??
    selectedGroup?.variants[0] ??
    null;
  const isCompact = mode === 'compact';

  if (outputs.length === 0) {
    return (
      <section
        className={cn(
          'flex h-full flex-col items-center justify-center p-6 text-center',
          className,
        )}
      >
        <div className="gen-shell-empty-state w-full max-w-sm rounded-[1.75rem] px-6 py-7">
          <div className="gen-shell-surface mx-auto flex h-14 w-14 items-center justify-center rounded-2xl">
            <HiOutlinePhoto className="h-6 w-6 text-foreground/38" />
          </div>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/38">
            Outputs
          </p>
          <h2 className="mt-3 text-lg font-semibold tracking-[-0.02em] text-foreground">
            {emptyTitle}
          </h2>
          <p className="mt-2 text-sm leading-6 text-foreground/56">
            {emptyDescription}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={cn('flex h-full min-h-0 flex-col', className)}>
      <div
        className={cn(
          'gen-shell-toolbar shrink-0 px-4 py-4',
          isCompact ? 'space-y-3' : 'space-y-4',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/35">
              Outputs
            </p>
            <h2 className="mt-1 truncate text-base font-semibold text-foreground">
              {selectedGroup?.title}
            </h2>
            {selectedGroup?.description ? (
              <p className="mt-1 line-clamp-2 text-xs text-foreground/55">
                {selectedGroup.description}
              </p>
            ) : null}
          </div>
          <span
            className="gen-shell-chip shrink-0 px-2.5 py-1 text-[11px]"
            data-tone="neutral"
          >
            {selectedGroup?.variants.length ?? 0} variant
            {selectedGroup?.variants.length === 1 ? '' : 's'}
          </span>
        </div>

        {selectedGroup && selectedVariant
          ? renderVariantPreview(selectedGroup, selectedVariant)
          : null}

        {selectedGroup && selectedGroup.variants.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {selectedGroup.variants.map((variant, index) => (
              <Button
                key={variant.id}
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                onClick={() => setSelectedVariantId(variant.id)}
                className="gen-shell-control inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
                data-active={
                  variant.id === selectedVariantId ? 'true' : 'false'
                }
              >
                <VariantIcon kind={variant.kind} />
                {getVariantLabel(selectedGroup, variant, index)}
              </Button>
            ))}
          </div>
        ) : null}

        {selectedGroup && selectedVariant ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              className="gen-shell-control h-9 rounded-xl px-3 text-xs font-semibold"
              data-tone="accent"
              onClick={() =>
                seedComposer(
                  buildAttachContent(selectedGroup, selectedVariant),
                  activeThreadId,
                )
              }
            >
              <HiOutlineChatBubbleLeftRight className="mr-1.5 h-4 w-4" />
              Use in chat
            </Button>

            {selectedVariant.url ? (
              <>
                <a
                  href={selectedVariant.url}
                  download
                  className="gen-shell-control inline-flex h-9 items-center rounded-xl px-3 text-xs font-semibold"
                >
                  <HiOutlineArrowDownTray className="mr-1.5 h-4 w-4" />
                  Download
                </a>
                <a
                  href={selectedVariant.url}
                  target="_blank"
                  rel="noreferrer"
                  className="gen-shell-control inline-flex h-9 items-center rounded-xl px-3 text-xs font-semibold"
                >
                  <HiOutlineArrowTopRightOnSquare className="mr-1.5 h-4 w-4" />
                  Open asset
                </a>
              </>
            ) : null}

            {selectedGroup.ctas
              .filter((cta) => cta.href)
              .slice(0, isCompact ? 1 : 2)
              .map((cta) => (
                <a
                  key={`${selectedGroup.id}-${cta.label}`}
                  href={cta.href}
                  target="_blank"
                  rel="noreferrer"
                  className="gen-shell-control inline-flex h-9 items-center rounded-xl px-3 text-xs font-semibold"
                >
                  <HiOutlineArrowTopRightOnSquare className="mr-1.5 h-4 w-4" />
                  {cta.label}
                </a>
              ))}
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-2.5">
          {outputs.map((group) => {
            const previewVariant = group.variants[0];
            return (
              <Button
                key={group.id}
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                onClick={() => {
                  setSelectedGroupId(group.id);
                  setSelectedVariantId(group.variants[0]?.id ?? null);
                }}
                className="gen-shell-surface flex w-full items-start gap-3 rounded-2xl px-3 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                data-active={group.id === selectedGroupId ? 'true' : 'false'}
              >
                <div className="mt-0.5 shrink-0">
                  <VariantIcon kind={previewVariant.kind} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold tracking-[-0.01em] text-foreground">
                      {group.title}
                    </p>
                    {group.status ? (
                      <span
                        className="gen-shell-chip px-2 py-0.5 text-[10px] uppercase tracking-wide"
                        data-tone="neutral"
                      >
                        {group.status}
                      </span>
                    ) : null}
                  </div>
                  {group.description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-foreground/50">
                      {group.description}
                    </p>
                  ) : null}
                  <p className="mt-2 text-[11px] text-foreground/40">
                    {group.variants.length} variant
                    {group.variants.length === 1 ? '' : 's'}
                  </p>
                </div>
              </Button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
