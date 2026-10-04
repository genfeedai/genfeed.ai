'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IngredientPromptBlockProps } from '@genfeedai/props/content/ingredient.props';
import { ClipboardService } from '@genfeedai/services/core/clipboard.service';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import { Button } from '@ui/primitives/button';
import { ChevronDown, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * Past this many characters (or lines) the prompt opens clamped. Four lines of
 * the rail's width hold roughly this much, so a shorter prompt never shows a
 * toggle that reveals nothing.
 */
const PROMPT_PREVIEW_CHARS = 200;
const PROMPT_PREVIEW_LINES = 4;

/**
 * The prompt that made an asset: a four-line preview first, the full text one
 * click away, and a copy action that never needs the text expanded.
 */
export default function IngredientPromptBlock({
  className,
  prompt,
}: IngredientPromptBlockProps) {
  const translate = useTranslations('pages.library.inspector');
  const [isExpanded, setIsExpanded] = useState(false);
  const text = prompt?.trim();

  if (!text) {
    return null;
  }

  const isLong =
    text.length > PROMPT_PREVIEW_CHARS ||
    text.split('\n').length > PROMPT_PREVIEW_LINES;
  const isClamped = isLong && !isExpanded;

  return (
    <section
      aria-label={translate('prompt')}
      className={cn('flex min-w-0 flex-col gap-2', className)}
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-2xs uppercase tracking-[0.12em] text-foreground/35">
          {translate('prompt')}
        </h4>
        <Button
          ariaLabel={translate('copyPrompt')}
          className="size-6 text-foreground/45 hover:text-foreground"
          icon={<Copy className="size-3.5" />}
          onClick={() => ClipboardService.getInstance().copyToClipboard(text)}
          size={ButtonSize.ICON}
          tooltip={translate('copyPrompt')}
          type="button"
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      </div>

      <InsetSurface className="flex flex-col gap-2" density="compact">
        <p
          className={cn(
            'min-w-0 select-text whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/78',
            isClamped && 'line-clamp-4',
          )}
          data-testid="ingredient-prompt-text"
        >
          {text}
        </p>

        {isLong ? (
          <Button
            aria-expanded={isExpanded}
            className="flex w-fit items-center gap-1 text-xs text-foreground/55 hover:text-foreground"
            onClick={() => setIsExpanded((current) => !current)}
            type="button"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          >
            {isExpanded ? translate('showLess') : translate('showFullPrompt')}
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'size-3.5 transition-transform',
                isExpanded && 'rotate-180',
              )}
            />
          </Button>
        ) : null}
      </InsetSurface>
    </section>
  );
}
