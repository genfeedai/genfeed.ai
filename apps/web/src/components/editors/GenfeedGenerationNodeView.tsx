'use client';

import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { Switch } from '@ui/primitives/switch';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * How a generation block looks while writing: which asset it is, and a
 * switch for whether readers see its prompt.
 */
export default function GenfeedGenerationNodeView({
  node,
  updateAttributes,
}: NodeViewProps): React.ReactElement {
  const t = useTranslations('ui.articleGenerationBlock');
  const isPromptShown = node.attrs.isPromptShown !== false;
  const kind = node.attrs.kind === 'video' ? 'video' : 'image';

  return (
    <NodeViewWrapper
      className="not-prose my-4 flex flex-wrap items-center justify-between gap-3 border border-border bg-muted/40 p-3"
      contentEditable={false}
      data-drag-handle=""
    >
      <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
        <Sparkles className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="truncate">
          {t('label', { id: String(node.attrs.ingredientId ?? ''), kind })}
        </span>
      </span>
      <Switch
        isChecked={isPromptShown}
        label={t('showPrompt')}
        onCheckedChange={(checked) =>
          updateAttributes({ isPromptShown: checked })
        }
        size="sm"
      />
    </NodeViewWrapper>
  );
}
