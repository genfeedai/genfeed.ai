import { useAgentChatStore } from '@cloud/agent/stores/agent-chat.store';
import type {
  ThreadOutputGroup,
  ThreadOutputVariant,
} from '@cloud/agent/utils/extract-thread-outputs';
import { extractThreadOutputs } from '@cloud/agent/utils/extract-thread-outputs';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import Button from '@ui/buttons/base/Button';
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
        className="aspect-[4/5] w-full rounded-2xl border border-white/[0.08] bg-black/20 object-cover"
      />
    );
  }

  if (variant.kind === 'audio' && variant.url) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <HiOutlineMusicalNote className="h-4 w-4 text-primary/80" />
          {variant.title ?? group.title}
        </div>
        <audio src={variant.url} controls className="w-full" />
      </div>
    );
  }

  if (variant.kind === 'text') {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <HiOutlineDocumentText className="h-4 w-4 text-primary/80" />
          {variant.title ?? group.title}
        </div>
        <pre className="max-h-[18rem] overflow-auto whitespace-pre-wrap break-words text-sm text-foreground/75">
          {variant.textContent}
        </pre>
      </div>
    );
  }

  if (variant.url) {
    return (
      <img
        src={variant.url}
        alt={variant.title ?? group.title}
        className="aspect-[4/5] w-full rounded-2xl border border-white/[0.08] bg-black/20 object-cover"
      />
    );
  }

  return (
    <div className="rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.03] p-8 text-center text-sm text-foreground/55">
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
          'flex h-full flex-col items-center justify-center px-6 text-center',
          className,
        )}
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] ring-1 ring-inset ring-white/[0.08]">
          <HiOutlinePhoto className="h-6 w-6 text-foreground/35" />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          {emptyTitle}
        </h2>
        <p className="mt-2 max-w-sm text-sm text-foreground/55">
          {emptyDescription}
        </p>
      </section>
    );
  }

  return (
    <section className={cn('flex h-full min-h-0 flex-col', className)}>
      <div
        className={cn(
          'border-b border-white/[0.08] px-4 py-4',
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
          <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-foreground/55">
            {selectedGroup?.variants.length ?? 0} variant
            {selectedGroup?.variants.length === 1 ? '' : 's'}
          </span>
        </div>

        {selectedVariant
          ? renderVariantPreview(selectedGroup!, selectedVariant)
          : null}

        {selectedGroup && selectedGroup.variants.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {selectedGroup.variants.map((variant, index) => (
              <button
                key={variant.id}
                type="button"
                onClick={() => setSelectedVariantId(variant.id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                  variant.id === selectedVariantId
                    ? 'border-primary/35 bg-primary/10 text-primary'
                    : 'border-white/[0.08] bg-white/[0.03] text-foreground/60 hover:bg-white/[0.06] hover:text-foreground',
                )}
              >
                <VariantIcon kind={variant.kind} />
                {getVariantLabel(selectedGroup, variant, index)}
              </button>
            ))}
          </div>
        ) : null}

        {selectedGroup && selectedVariant ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant={ButtonVariant.OUTLINE}
              className="h-9 px-3 text-xs"
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
                  className="inline-flex h-9 items-center rounded-lg border border-white/[0.12] px-3 text-xs font-medium text-foreground/70 transition-colors hover:bg-white/[0.06] hover:text-foreground"
                >
                  <HiOutlineArrowDownTray className="mr-1.5 h-4 w-4" />
                  Download
                </a>
                <a
                  href={selectedVariant.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center rounded-lg border border-white/[0.12] px-3 text-xs font-medium text-foreground/70 transition-colors hover:bg-white/[0.06] hover:text-foreground"
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
                  className="inline-flex h-9 items-center rounded-lg border border-white/[0.12] px-3 text-xs font-medium text-foreground/70 transition-colors hover:bg-white/[0.06] hover:text-foreground"
                >
                  <HiOutlineArrowTopRightOnSquare className="mr-1.5 h-4 w-4" />
                  {cta.label}
                </a>
              ))}
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-2">
          {outputs.map((group) => {
            const previewVariant = group.variants[0];
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  setSelectedGroupId(group.id);
                  setSelectedVariantId(group.variants[0]?.id ?? null);
                }}
                className={cn(
                  'flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                  group.id === selectedGroupId
                    ? 'border-primary/25 bg-primary/10'
                    : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]',
                )}
              >
                <div className="mt-0.5 shrink-0">
                  <VariantIcon kind={previewVariant.kind} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {group.title}
                    </p>
                    {group.status ? (
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-wide text-foreground/45">
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
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
